import type { HydratedDocument, Model, Types } from "mongoose";

export type ReviewStatus = "pending" | "approved" | "rejected";

// === Базовые поля, сохраняемые в БД ===
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

// === Методы экземпляра (если появятся) ===
export type IProductReviewMethods = {};

// === Статические методы модели ===
export interface IProductReviewModel extends Model<
  IProductReview,
  {},
  IProductReviewMethods
> {
  // например: findApproved(): Promise<ProductReviewDocument[]>;
}

// === Тип документа с методами ===
export type ProductReviewDocument = HydratedDocument<
  IProductReview,
  IProductReviewMethods
>;
