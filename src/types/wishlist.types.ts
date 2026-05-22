import type { HydratedDocument, Model, Types } from "mongoose";

// === Вложенный документ WishlistItem ===
export interface IWishlistItem {
  product: Types.ObjectId;
  addedAt: Date;
  notes?: string;
}

// === Настройки вишлиста ===
export interface IWishlistSettings {
  notifyOnPriceDrop: boolean;
  notifyOnRestock: boolean;
  sortBy: "addedAt" | "priceAsc" | "priceDesc" | "popularity" | "name";
}

// === Базовые поля, сохраняемые в БД ===
export interface IWishlist {
  user: Types.ObjectId;
  items: IWishlistItem[];
  settings: IWishlistSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра ===
export interface IWishlistMethods {
  hasProduct(productId: Types.ObjectId | string): boolean;
  addProduct(
    productId: Types.ObjectId | string,
    notes?: string,
  ): Promise<WishlistDocument>;
  removeProduct(productId: Types.ObjectId | string): Promise<WishlistDocument>;
  updateSettings(
    settings: Partial<IWishlistSettings>,
  ): Promise<WishlistDocument>;
}

// === Статические методы модели ===
export interface IWishlistModel extends Model<IWishlist, {}, IWishlistMethods> {
  findByUser(userId: Types.ObjectId | string): Promise<WishlistDocument | null>;
}

// === Тип документа с методами ===
export type WishlistDocument = HydratedDocument<IWishlist, IWishlistMethods>;
