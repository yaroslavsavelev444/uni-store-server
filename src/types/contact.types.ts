import type { HydratedDocument, Model, Types } from "mongoose";

// === Phone subdocument ===
export interface IPhone {
  type: "support" | "sales" | "general" | "fax" | "accounting" | "other";
  value: string;
  description?: string;
  isPrimary: boolean;
  sortOrder: number;
}

// === Email subdocument ===
export interface IEmail {
  type: "support" | "info" | "sales" | "security" | "hr" | "other";
  value: string;
  description?: string;
  isPrimary: boolean;
  sortOrder: number;
}

// === Social link subdocument ===
export interface ISocialLink {
  platform: "telegram" | "whatsapp" | "vk" | "github" | "max" | "other";
  url: string;
  title?: string;
  sortOrder: number;
}

// === Other contact subdocument ===
export interface IOtherContact {
  type: "messenger" | "forum" | "custom" | "chat" | "bot";
  name: string;
  value: string;
  description?: string;
  sortOrder: number;
}

// === Базовые поля, сохраняемые в БД ===
export interface IContact {
  companyName: string;
  legalAddress?: string;
  physicalAddress?: string;
  phones: IPhone[];
  emails: IEmail[];
  socialLinks: ISocialLink[];
  otherContacts: IOtherContact[];
  workingHours?: string;
  isActive: boolean;
  updatedBy: Types.ObjectId;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type IContactMethods = {};

// === Статические методы модели ===
export interface IContactModel extends Model<IContact, {}, IContactMethods> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type ContactDocument = HydratedDocument<IContact, IContactMethods>;
