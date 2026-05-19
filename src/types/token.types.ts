import type { HydratedDocument, Model, Types } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface IToken {
  user?: Types.ObjectId;
  refreshToken: string;
}

// === Методы экземпляра (если появятся) ===
export type ITokenMethods = {};

// === Статические методы модели ===
export interface ITokenModel extends Model<IToken, {}, ITokenMethods> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type TokenDocument = HydratedDocument<IToken, ITokenMethods>;
