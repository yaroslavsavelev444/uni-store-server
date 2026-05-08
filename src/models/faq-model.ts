import { model, Schema } from "mongoose";
import type {
  FaqTopicModelType,
  IFaqQuestion,
  IFaqTopic,
  IFaqTopicDocument,
} from "../types/faq.types.js";

// Схема вопроса
const questionSchema = new Schema<IFaqQuestion>({
  question: {
    type: String,
    required: [true, "Вопрос обязателен для заполнения"],
    trim: true,
  },
  answer: {
    type: String,
    required: [true, "Ответ обязателен для заполнения"],
  },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware для обновления даты вопроса
questionSchema.pre("save", function (this: IFaqQuestion, next) {
  this.updatedAt = new Date();
  next();
});

// Схема темы
const topicSchema = new Schema<IFaqTopic, FaqTopicModelType, IFaqTopicMethods>({
  title: {
    type: String,
    required: [true, "Название темы обязательно для заполнения"],
    trim: true,
  },
  description: { type: String, trim: true },
  questions: [questionSchema],
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Индексы
topicSchema.index({ order: 1, isActive: 1 });
questionSchema.index({ order: 1, isActive: 1 });

// Middleware для обновления даты темы
topicSchema.pre("save", function (this: IFaqTopicDocument, next) {
  this.updatedAt = new Date();
  next();
});

// Экспорт моделей
export const FaqTopicModel = model<IFaqTopicDocument, FaqTopicModelType>(
  "FaqTopic",
  topicSchema,
);
export const FaqQuestionModel = model<IFaqQuestion>(
  "FaqQuestion",
  questionSchema,
);
