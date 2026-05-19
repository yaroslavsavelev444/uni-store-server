import type { HydratedDocument, Model, Types } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface IUserSearch {
  userId: Types.ObjectId;
  selectedProductId: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра ===
export type IUserSearchMethods = {};

// === Статические методы модели ===
export interface IUserSearchModel extends Model<
  IUserSearch,
  {},
  IUserSearchMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа ===
export type UserSearchDocument = HydratedDocument<
  IUserSearch,
  IUserSearchMethods
>;
