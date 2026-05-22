import type { HydratedDocument, Model, Types } from "mongoose";

export type RevokedReason =
  | "password_changed_all_sessions"
  | "password_changed_other_sessions"
  | "manually_revoked"
  | "suspicious_activity"
  | "force_logout";

// === Базовые поля, сохраняемые в БД ===
export interface IUserSession {
  userId: Types.ObjectId;
  refreshToken: string;
  deviceId?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  os?: string | null;
  osVersion?: string | null;
  ip?: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  revoked: boolean;
  revokedAt?: Date | null;
  revokedReason?: RevokedReason | null;
}

// === Методы экземпляра ===
export type IUserSessionMethods = {};

// === Статические методы модели ===
export interface IUserSessionModel extends Model<
  IUserSession,
  {},
  IUserSessionMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type UserSessionDocument = HydratedDocument<
  IUserSession,
  IUserSessionMethods
>;
