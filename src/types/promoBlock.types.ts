import type { HydratedDocument, Model } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface IPromoBlock {
  title: string;
  subtitle?: string;
  image?: string;
  link?: string;
  reversed: boolean;
  page: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type IPromoBlockMethods = {};

// === Статические методы модели ===
export interface IPromoBlockModel extends Model<
  IPromoBlock,
  {},
  IPromoBlockMethods
> {
  // например: findActive(): Promise<PromoBlockDocument[]>;
}

// === Тип документа с методами ===
export type PromoBlockDocument = HydratedDocument<
  IPromoBlock,
  IPromoBlockMethods
>;
