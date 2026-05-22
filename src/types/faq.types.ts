import type { HydratedDocument, Model, Types } from "mongoose";

// === Question subdocument ===
export interface IFaqQuestion {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Topic ===
export interface IFaqTopic {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  questions: IFaqQuestion[];
  order: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если будут) ===
export type IFaqTopicMethods = {};

// === Статические методы модели ===
export interface IFaqTopicModel extends Model<IFaqTopic, {}, IFaqTopicMethods> {
  // findBySlug(slug: string): Promise<HydratedDocument<IFaqTopic, IFaqTopicMethods> | null>;
}

// === Тип документа с методами ===
export type FaqTopicDocument = HydratedDocument<IFaqTopic, IFaqTopicMethods>;

// Для Question, если нужна отдельная модель
export type IFaqQuestionMethods = {};
export interface IFaqQuestionModel extends Model<
  IFaqQuestion,
  {},
  IFaqQuestionMethods
> {}
export type FaqQuestionDocument = HydratedDocument<
  IFaqQuestion,
  IFaqQuestionMethods
>;
