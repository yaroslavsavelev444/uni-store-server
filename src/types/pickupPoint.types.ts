import type { HydratedDocument, Model, Types } from "mongoose";

// === Вложенные поддокументы ===
export interface IAddress {
  street: string;
  city: string;
  postalCode?: string;
  country: string;
}

export interface ICoordinates {
  lat?: number;
  lng?: number;
}

export interface IContact {
  phone?: string;
  email?: string;
}

// === Базовые поля, сохраняемые в БД ===
export interface IPickupPoint {
  name: string;
  address: IAddress;
  coordinates?: ICoordinates;
  workingHours: string;
  contact?: IContact;
  description?: string;
  updatedBy: Types.ObjectId;
  isActive: boolean;
  isMain: boolean;
  orderIndex: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type IPickupPointMethods = {};

// === Статические методы модели ===
export interface IPickupPointModel extends Model<
  IPickupPoint,
  {},
  IPickupPointMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type PickupPointDocument = HydratedDocument<
  IPickupPoint,
  IPickupPointMethods
>;
