import type { Document, Model } from "mongoose";

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

export interface IPickupPoint {
  name: string;
  address: IAddress;
  coordinates?: ICoordinates;
  workingHours: string;
  contact?: IContact;
  description?: string;
  isActive: boolean;
  isMain: boolean;
  orderIndex: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IPickupPointVirtuals = {};

export type IPickupPointMethods = {};

export interface PickupPointModelType extends Model<
  IPickupPointDocument,
  {},
  IPickupPointMethods
> {}

export type IPickupPointDocument = Document<unknown, {}, IPickupPoint> &
  IPickupPoint &
  IPickupPointVirtuals &
  IPickupPointMethods;
