import type { Model, Types } from "mongoose";

export type ReviewStatus = "pending" | "approved" | "rejected";

// POJO (простой JavaScript-объект)
export interface IProductReview {
  user: Types.ObjectId;
  product: Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  pros: string[];
  cons: string[];
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Методы экземпляра (если они есть)
export type IProductReviewMethods = {};

// Тип модели (со статическими методами, если есть)
export interface ProductReviewModelType extends Model<
  IProductReview,
  {},
  IProductReviewMethods
> {
  // статические методы: например, findApproved(): Promise<HydratedProductReview[]>;
}

// Тип "оживлённого" документа (используйте при необходимости в функциях)
// Обычно можно обойтись без него, но для ясности приведу:
export type HydratedProductReview = import("mongoose").HydratedDocument<
  IProductReview,
  IProductReviewMethods
>;
