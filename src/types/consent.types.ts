import type { Document, Model, Types } from "mongoose";

// === Вложенная схема VersionHistory ===
export interface IVersionHistory {
  version: string; // semver
  content: string;
  documentUrl?: string;
  author?: Types.ObjectId;
  changeDescription?: string;
  createdAt?: Date;
}

export type IVersionHistoryMethods = {};

export type VersionHistoryDocument = Document<unknown, {}, IVersionHistory> &
  IVersionHistory &
  IVersionHistoryMethods;

// === Основной документ Consent ===
export interface IConsent {
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

  // служебные поля для хуков (не сохраняются в БД)
  _originalContent?: string;
  _originalDocumentUrl?: string;
  _originalLastUpdatedBy?: Types.ObjectId;
  _originalChangeDescription?: string;
  checksum?: string;
}

export interface IConsentVirtuals {
  isPublished: boolean;
}

export type IConsentMethods = {};

export interface ConsentModelType extends Model<
  IConsentDocument,
  {},
  IConsentMethods
> {
  // статические методы (если будут)
}

export type IConsentDocument = Document<unknown, {}, IConsent> &
  IConsent &
  IConsentVirtuals &
  IConsentMethods;
