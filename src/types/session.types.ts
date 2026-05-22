import type { HydratedDocument, Model, Types } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface ISession {
  user: Types.ObjectId;
  refreshToken: string;
  userAgent?: string;
  ip?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type ISessionMethods = {};

// === Статические методы модели ===
export interface ISessionModel extends Model<ISession, {}, ISessionMethods> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type SessionDocument = HydratedDocument<ISession, ISessionMethods>;
