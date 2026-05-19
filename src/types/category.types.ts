import type { HydratedDocument, Model, Types } from "mongoose";

export interface ICategoryImage {
  url?: string;
  alt?: string;
  size?: number;
  mimetype?: string;
}

// === Базовые поля, сохраняемые в БД ===
export interface ICategory {
  _id?: Types.ObjectId;
  name: string;
  slug: string;
  subtitle?: string;
  description?: string;
  image?: ICategoryImage;
  order: number;
  isActive: boolean;
  metaTitle?: string;
  metaDescription?: string;
  keywords: string[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type ICategoryMethods = {};

// === Статические методы модели ===
export interface ICategoryModel extends Model<ICategory, {}, ICategoryMethods> {
  exists(id: string | Types.ObjectId): Promise<boolean>;
}

// === Тип документа с методами ===
export type CategoryDocument = HydratedDocument<ICategory, ICategoryMethods>;
