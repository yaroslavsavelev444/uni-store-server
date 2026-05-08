import type { Document, Model, Types } from "mongoose";

export interface ICategoryImage {
  url?: string;
  alt?: string;
  size?: number;
  mimetype?: string;
}

export interface ICategory {
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

export interface ICategoryVirtuals {
  productCount: number;
}

export type ICategoryMethods = {};

export interface CategoryModelType extends Model<
  ICategoryDocument,
  {},
  ICategoryMethods
> {
  exists(id: string | Types.ObjectId): Promise<boolean>;
}

export type ICategoryDocument = Document<unknown, {}, ICategory> &
  ICategory &
  ICategoryVirtuals &
  ICategoryMethods;
