import type { HydratedDocument, Model, Types } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface IUserSecurity {
  userId: Types.ObjectId;
  twoFACodeHash?: Buffer | null; // ✅ изменено с string на Buffer
  twoFACodeExpiresAt?: Date | null;
  twoFAAttempts: number;
  resetTokenExpiration?: Date | null;
  resetTokenHash?: string | null;
  resetTokenAttempts?: number;
  resetTokenStatus: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра ===
export type IUserSecurityMethods = {};

// === Статические методы модели ===
export interface IUserSecurityModel extends Model<
  IUserSecurity,
  {},
  IUserSecurityMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type UserSecurityDocument = HydratedDocument<
  IUserSecurity,
  IUserSecurityMethods
>;
