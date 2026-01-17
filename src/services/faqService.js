// services/faqService.js
const { FaqTopicModel } = require("../models/index.models");
const redis = require("../redis/redis.client");

const FAQ_PUBLIC_CACHE_KEY = "faq:public:v1";
const FAQ_PUBLIC_TTL = 60 * 60; // 1 hour

class FaqService {
  async getPublicFaq() {
    // const cached = await redis.getJson(FAQ_PUBLIC_CACHE_KEY);
    // if (cached) return cached;

    const topics = await FaqTopicModel.find({ isActive: true })
      .sort({ order: 1 })
      .lean();

    const formatted = topics.map((topic) => ({
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

    // await redis.setJson(FAQ_PUBLIC_CACHE_KEY, formatted, FAQ_PUBLIC_TTL);
    return formatted;
  }

  async invalidatePublicCache() {
    await redis.del(FAQ_PUBLIC_CACHE_KEY);
  }

  async getAllFaqForAdmin() {
    return FaqTopicModel.find().sort({ order: 1 }).lean();
  }

  async createTopic(data) {
    const last = await FaqTopicModel.findOne().sort({ order: -1 });
    const topic = await FaqTopicModel.create({
      ...data,
      order: data.order ?? (last ? last.order + 1 : 0),
    });
    await this.invalidatePublicCache();
    return topic;
  }

  async updateTopic(id, data) {
    const topic = await FaqTopicModel.findByIdAndUpdate(id, data, {
      new: true,
    });
    if (!topic) throw new Error("Topic not found");
    await this.invalidatePublicCache();
    return topic;
  }

  async deleteTopic(id) {
    const res = await FaqTopicModel.findByIdAndDelete(id);
    if (!res) throw new Error("Topic not found");
    await this.invalidatePublicCache();
  }

  async addQuestion(topicId, data) {
    const topic = await FaqTopicModel.findById(topicId);
    if (!topic) throw new Error("Topic not found");

    const maxOrder = Math.max(0, ...topic.questions.map((q) => q.order));
    topic.questions.push({ ...data, order: data.order ?? maxOrder + 1 });
    await topic.save();

    await this.invalidatePublicCache();
    return topic.questions.at(-1);
  }

  async updateQuestion(topicId, questionId, data) {
    const topic = await FaqTopicModel.findById(topicId);
    const q = topic?.questions.id(questionId);
    if (!q) throw new Error("Question not found");

    Object.assign(q, data);
    await topic.save();

    await this.invalidatePublicCache();
    return q;
  }

  async deleteQuestion(topicId, questionId) {
    const topic = await FaqTopicModel.findById(topicId);
    if (!topic) throw new Error("Topic not found");

    topic.questions.id(questionId)?.remove();
    await topic.save();

    await this.invalidatePublicCache();
  }

  async reorderTopics(orders) {
    if (!Array.isArray(orders)) throw new Error("Invalid orders");

    await FaqTopicModel.bulkWrite(
      orders.map((o) => ({
        updateOne: {
          filter: { _id: o.topicId },
          update: { $set: { order: o.order } },
        },
      }))
    );

    await this.invalidatePublicCache();
  }

  async reorderQuestions(topicId, orders) {
    const topic = await FaqTopicModel.findById(topicId);
    if (!topic) throw new Error("Topic not found");

    orders.forEach((o) => {
      const q = topic.questions.id(o.questionId);
      if (q) q.order = o.order;
    });

    await topic.save();
    await this.invalidatePublicCache();
  }
}

module.exports = new FaqService();
