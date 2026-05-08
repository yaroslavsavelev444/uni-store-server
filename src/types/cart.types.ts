import type { Document, Model, Types } from "mongoose";

// === CartItem (вложенный документ) ===
export interface ICartItem {
  product: Types.ObjectId;
  quantity: number;
  addedAt: Date;
}

export type ICartItemMethods = {};

export type CartItemDocument = Document<unknown, {}, ICartItem> &
  ICartItem &
  ICartItemMethods;

// === Основной документ Cart ===
export interface ICart {
  user: Types.ObjectId;
  items: ICartItem[];
  updatedAt: Date;
  createdAt?: Date;
}

export interface ICartVirtuals {
  totalItems: number;
}

export type ICartMethods = {};

export interface CartModelType extends Model<ICartDocument, {}, ICartMethods> {
  findByUser(userId: string | Types.ObjectId): Promise<ICartDocument | null>;
}

export type ICartDocument = Document<unknown, {}, ICart> &
  ICart &
  ICartVirtuals &
  ICartMethods;
