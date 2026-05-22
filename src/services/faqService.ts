// services/faqService.ts
//@ts-nocheck
import { Types } from "mongoose";
import { FaqTopicModel } from "../models/index.models.js";
import redis from "../redis/redis.client.js";
import type { IFaqQuestion, IFaqTopic } from "../types/faq.types.js";
import type {
  CreateQuestionData,
  CreateTopicData,
  PublicFaqTopic,
  QuestionOrder,
  TopicOrder,
  UpdateQuestionData,
  UpdateTopicData,
} from "../types/faq-service.js";

const FAQ_PUBLIC_CACHE_KEY = "faq:public:v1";
const FAQ_PUBLIC_TTL = 60 * 60; // 1 hour

class FaqService {
  /**
   * Получить публичный FAQ (с кешированием)
   */
  async getPublicFaq(): Promise<PublicFaqTopic[]> {
    const cached = await redis.getJson<PublicFaqTopic[]>(FAQ_PUBLIC_CACHE_KEY);
    if (cached) return cached;

    const topics = await FaqTopicModel.find({ isActive: true })
      .sort({ order: 1 })
      .lean<IFaqTopic[]>();

    const formatted: PublicFaqTopic[] = topics.map((topic) => ({
      id: topic._id.toString(),
      title: topic.title,
      questions: (topic.questions || [])
        .filter((q) => q.isActive)
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((q) => ({
          id: q._id.toString(),
          question: q.question,
          answer: q.answer,
        })),
    }));

    await redis.setJson(FAQ_PUBLIC_CACHE_KEY, formatted, FAQ_PUBLIC_TTL);
    return formatted;
  }

  /**
   * Инвалидировать публичный кеш
   */
  async invalidatePublicCache(): Promise<void> {
    await redis.del(FAQ_PUBLIC_CACHE_KEY);
  }

  /**
   * Получить все темы для админа
   */
  async getAllFaqForAdmin(): Promise<IFaqTopic[]> {
    return FaqTopicModel.find().sort({ order: 1 }).lean<IFaqTopic[]>();
  }

  /**
   * Создать тему
   */
  async createTopic(data: CreateTopicData): Promise<IFaqTopic> {
    const last = await FaqTopicModel.findOne()
      .sort({ order: -1 })
      .lean<IFaqTopic>();
    const topic = await FaqTopicModel.create({
      ...data,
      order: data.order ?? (last ? last.order + 1 : 0),
    });
    await this.invalidatePublicCache();
    return topic;
  }

  /**
   * Обновить тему
   */
  async updateTopic(id: string, data: UpdateTopicData): Promise<IFaqTopic> {
    const topic = await FaqTopicModel.findByIdAndUpdate(
      new Types.ObjectId(id),
      data,
      { new: true },
    );
    if (!topic) throw new Error("Topic not found");
    await this.invalidatePublicCache();
    return topic;
  }

  /**
   * Удалить тему
   */
  async deleteTopic(id: string): Promise<void> {
    const res = await FaqTopicModel.findByIdAndDelete(new Types.ObjectId(id));
    if (!res) throw new Error("Topic not found");
    await this.invalidatePublicCache();
  }

  /**
   * Добавить вопрос в тему
   */
  async addQuestion(
    topicId: string,
    data: CreateQuestionData,
  ): Promise<IFaqQuestion> {
    const topic = await FaqTopicModel.findById(new Types.ObjectId(topicId));
    if (!topic) throw new Error("Topic not found");

    const maxOrder = Math.max(0, ...topic.questions.map((q) => q.order));
    topic.questions.push({
      ...data,
      order: data.order ?? maxOrder + 1,
    } as IFaqQuestion);
    await topic.save();

    await this.invalidatePublicCache();
    return topic.questions[topic.questions.length - 1];
  }

  /**
   * Обновить вопрос
   */
  async updateQuestion(
    topicId: string,
    questionId: string,
    data: UpdateQuestionData,
  ): Promise<IFaqQuestion> {
    const topic = await FaqTopicModel.findById(new Types.ObjectId(topicId));
    if (!topic) throw new Error("Topic not found");

    const question = topic.questions.id(questionId);
    if (!question) throw new Error("Question not found");

    Object.assign(question, data);
    await topic.save();

    await this.invalidatePublicCache();
    return question;
  }

  /**
   * Удалить вопрос
   */
  async deleteQuestion(topicId: string, questionId: string): Promise<void> {
    const topic = await FaqTopicModel.findById(new Types.ObjectId(topicId));
    if (!topic) throw new Error("Topic not found");

    const question = topic.questions.id(questionId);
    if (question) {
      question.deleteOne();
    }
    await topic.save();

    await this.invalidatePublicCache();
  }

  /**
   * Изменить порядок тем
   */
  async reorderTopics(orders: TopicOrder[]): Promise<void> {
    if (!Array.isArray(orders)) throw new Error("Invalid orders");

    await FaqTopicModel.bulkWrite(
      orders.map((o) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(o.topicId) },
          update: { $set: { order: o.order } },
        },
      })),
    );

    await this.invalidatePublicCache();
  }

  /**
   * Изменить порядок вопросов в теме
   */
  async reorderQuestions(
    topicId: string,
    orders: QuestionOrder[],
  ): Promise<void> {
    const topic = await FaqTopicModel.findById(new Types.ObjectId(topicId));
    if (!topic) throw new Error("Topic not found");

    orders.forEach((o) => {
      const q = topic.questions.id(o.questionId);
      if (q) q.order = o.order;
    });

    await topic.save();
    await this.invalidatePublicCache();
  }
}

export default new FaqService();
