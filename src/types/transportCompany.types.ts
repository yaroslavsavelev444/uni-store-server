import type { HydratedDocument, Model } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface ITransportCompany {
  name: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type ITransportCompanyMethods = {};

// === Статические методы модели ===
export interface ITransportCompanyModel extends Model<
  ITransportCompany,
  {},
  ITransportCompanyMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type TransportCompanyDocument = HydratedDocument<
  ITransportCompany,
  ITransportCompanyMethods
>;
