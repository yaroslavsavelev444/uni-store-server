import type { HydratedDocument, Model } from "mongoose";

// Интерфейс POJO (простой объект, без методов и виртуалов)
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

// Если у модели есть методы экземпляра – опишите их здесь
export type IPromoBlockMethods = {};

// Тип модели со статическими методами (если будут)
export interface PromoBlockModelType extends Model<
  IPromoBlock,
  {},
  IPromoBlockMethods
> {
  // статические методы: например, findActive(): Promise<PromoBlockDocument[]>;
}

// Тип документа с методами (используем встроенный HydratedDocument)
export type PromoBlockDocument = HydratedDocument<
  IPromoBlock,
  IPromoBlockMethods
>;
