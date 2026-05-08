import type { Document, Model } from "mongoose";

export type MediaType = "image" | "video";

export interface IMainMaterial {
  caption: string;
  mediaUrl: string;
  mediaType: MediaType;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IMainMaterialVirtuals = {};

export type IMainMaterialMethods = {};

export interface MainMaterialModelType extends Model<
  IMainMaterialDocument,
  {},
  IMainMaterialMethods
> {}

export type IMainMaterialDocument = Document<unknown, {}, IMainMaterial> &
  IMainMaterial &
  IMainMaterialVirtuals &
  IMainMaterialMethods;
