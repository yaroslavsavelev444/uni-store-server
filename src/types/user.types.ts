import type { HydratedDocument, Model, Types } from "mongoose";
import { ORG_ID_REGEX } from "./../constants/regex.js";

// === Вложенные структуры ===
export interface IActivations {
  emailToken?: string;
  emailTokenExpiration?: Date;
}

export interface ITokens {
  resetToken?: string | null;
  resetTokenStatus?: "pending" | "verified" | null;
  resetTokenExpiration?: Date | null;
}

export interface IPasswordChangeEntry {
  timestamp: Date;
  ip: string;
}

export interface UserDTO {
  id: string;
  email: string;
  role: string;
  name: string;
}
export type UserRole = "user" | "admin" | "superadmin";
export type UserStatus = "active" | "blocked" | "suspended";
// === Базовые поля, сохраняемые в БД ===
export interface IUser {
  _id: Types.ObjectId;
  email: string;
  password: string;
  role: UserRole;
  name: string;
  activations: IActivations;
  tokens: ITokens;
  passwordChangeHistory?: IPasswordChangeEntry[];
  status: UserStatus;
  blockedUntil: Date | null;
  lastSanction?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type IUserMethods = {};

// === Статические методы модели ===
export interface IUserModel extends Model<IUser, {}, IUserMethods> {
  isUserBlocked(userId: string | Types.ObjectId): Promise<boolean>;
}

// === Тип документа с методами ===
export type UserDocument = HydratedDocument<IUser, IUserMethods>;
