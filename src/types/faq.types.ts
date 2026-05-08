import type { Document, Model } from "mongoose";

// === Question subdocument ===
export interface IFaqQuestion {
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IFaqQuestionMethods = {};

export type FaqQuestionDocument = Document<unknown, {}, IFaqQuestion> &
  IFaqQuestion &
  IFaqQuestionMethods;

// === Topic document ===
export interface IFaqTopic {
  title: string;
  description?: string;
  questions: IFaqQuestion[];
  order: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IFaqTopicVirtuals = {};

export type IFaqTopicMethods = {};

export interface FaqTopicModelType extends Model<
  IFaqTopicDocument,
  {},
  IFaqTopicMethods
> {
  // статические методы (если будут)
}

export type IFaqTopicDocument = Document<unknown, {}, IFaqTopic> &
  IFaqTopic &
  IFaqTopicVirtuals &
  IFaqTopicMethods;
