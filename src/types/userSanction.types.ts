import type { HydratedDocument, Model, Types } from "mongoose";

export type SanctionType = "block" | "warning" | "restriction";

// === Базовые поля, сохраняемые в БД ===
export interface IUserSanction {
  user: Types.ObjectId;
  admin: Types.ObjectId;
  type: SanctionType;
  reason?: string;
  duration: number; // часы, 0 = бессрочно
  expiresAt?: Date;
  isActive: boolean;
  metadata?: {
    ip?: string;
    userAgent?: string;
    additionalInfo?: any;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (виртуалы не входят сюда) ===
export type IUserSanctionMethods = {};

// === Статические методы модели ===
export interface IUserSanctionModel extends Model<
  IUserSanction,
  {},
  IUserSanctionMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами (виртуалы добавляются автоматически через HydratedDocument) ===
export type UserSanctionDocument = HydratedDocument<
  IUserSanction,
  IUserSanctionMethods
>;
