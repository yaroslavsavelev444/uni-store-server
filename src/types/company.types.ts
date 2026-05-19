import type { HydratedDocument, Model, Types } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface ICompany {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  companyName: string;
  legalAddress: string;
  companyAddress?: string;
  taxNumber: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type ICompanyMethods = {};

// === Статические методы модели ===
export interface ICompanyModel extends Model<ICompany, {}, ICompanyMethods> {
  // например: findByTaxNumber(taxNumber: string): Promise<CompanyDocument | null>;
}

// === Тип документа с методами ===
export type CompanyDocument = HydratedDocument<ICompany, ICompanyMethods>;
