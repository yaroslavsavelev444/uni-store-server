import type { HydratedDocument, Model, Types } from "mongoose";

export type ContentBlockType =
  | "text"
  | "image"
  | "link"
  | "heading"
  | "list"
  | "highlighted";
// === Вложенная схема ContentBlock ===
export interface IContentBlock {
  type: ContentBlockType;
  value: any; // Schema.Types.Mixed
}

// === Базовые поля, сохраняемые в БД ===
export interface ITopicCommon {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  position: number;
  imageUrl?: string;
  readingTime: number;
  contentBlocks: IContentBlock[];
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type ITopicCommonMethods = {};

// === Статические методы модели ===
export interface ITopicCommonModel extends Model<
  ITopicCommon,
  {},
  ITopicCommonMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type TopicCommonDocument = HydratedDocument<
  ITopicCommon,
  ITopicCommonMethods
>;
