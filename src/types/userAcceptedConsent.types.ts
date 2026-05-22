import type { HydratedDocument, Model, Types } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface IUserAcceptedConsent {
  userId: Types.ObjectId;
  consentSlug: string;
  consentVersion: string;
  acceptedAt: Date;
  ip: string;
  userAgent: string;
}

// === Методы экземпляра (если появятся) ===
export type IUserAcceptedConsentMethods = {};

// === Статические методы модели ===
export interface IUserAcceptedConsentModel extends Model<
  IUserAcceptedConsent,
  {},
  IUserAcceptedConsentMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type UserAcceptedConsentDocument = HydratedDocument<
  IUserAcceptedConsent,
  IUserAcceptedConsentMethods
>;
