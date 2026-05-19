import type { HydratedDocument, Model, Types } from "mongoose";

// === Вложенная схема VersionHistory ===
export interface IVersionHistory {
  version: string;
  content: string;
  documentUrl?: string;
  author?: Types.ObjectId;
  changeDescription?: string;
  createdAt?: Date;
}

// === Базовые поля, сохраняемые в БД ===
export interface IConsent {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  content: string;
  documentUrl?: string;
  isRequired: boolean;
  needsAcceptance: boolean;
  isActive: boolean;
  version: string;
  history: IVersionHistory[];
  lastUpdatedBy?: Types.ObjectId;
  lastUpdatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  // служебные поля (не сохраняются, используются в хуках)
  _originalContent?: string;
  _originalDocumentUrl?: string;
  _originalLastUpdatedBy?: Types.ObjectId;
  _originalChangeDescription?: string;
  checksum?: string;
}

// === Методы экземпляра (если появятся) ===
export type IConsentMethods = {};

// === Статические методы модели ===
export interface IConsentModel extends Model<IConsent, {}, IConsentMethods> {
  // например: findBySlug(slug: string): Promise<ConsentDocument | null>;
}

// === Тип документа с методами ===
export type ConsentDocument = HydratedDocument<IConsent, IConsentMethods>;
