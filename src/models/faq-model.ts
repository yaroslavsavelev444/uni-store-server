import { model, Schema } from "mongoose";
import type {
  FaqQuestionDocument,
  FaqTopicDocument,
  IFaqQuestion,
  IFaqQuestionModel,
  IFaqTopic,
  IFaqTopicMethods,
  IFaqTopicModel,
} from "../types/faq.types.js";

// Схема вопроса (вложенная)
const questionSchema = new Schema<IFaqQuestion>(
  {
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
  },
  { _id: true },
);

questionSchema.pre("save", function (this: FaqQuestionDocument, next) {
  this.updatedAt = new Date();
  next();
});

// Схема темы
const topicSchema = new Schema<IFaqTopic, IFaqTopicModel, IFaqTopicMethods>(
  {
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Индексы
topicSchema.index({ order: 1, isActive: 1 });

topicSchema.pre("save", function (this: FaqTopicDocument, next) {
  this.updatedAt = new Date();
  next();
});

// Экспорт моделей
export const FaqTopicModel = model<IFaqTopic, IFaqTopicModel>(
  "FaqTopic",
  topicSchema,
);
export const FaqQuestionModel = model<IFaqQuestion, IFaqQuestionModel>(
  "FaqQuestion",
  questionSchema,
);
