import type { HydratedDocument, Model, Types } from "mongoose";

// === CartItem (вложенный) ===
export interface ICartItem {
  product: Types.ObjectId;
  quantity: number;
  addedAt: Date;
}

// === Базовые поля, сохраняемые в БД ===
export interface ICart {
  user: Types.ObjectId;
  items: ICartItem[];
  updatedAt: Date;
  createdAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type ICartMethods = {};

// === Статические методы модели ===
export interface ICartModel extends Model<ICart, {}, ICartMethods> {
  findByUser(userId: string | Types.ObjectId): Promise<CartDocument | null>;
}

// === Тип документа с методами ===
export type CartDocument = HydratedDocument<ICart, ICartMethods>;
