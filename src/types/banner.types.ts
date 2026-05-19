import type { HydratedDocument, Model, Types } from "mongoose";

// === Enums ===
export const BannerAction = {
  None: "none",
  Link: "link",
  Screen: "screen",
} as const;

export const BannerStatus = {
  Draft: "draft",
  Active: "active",
  Archived: "archived",
} as const;

export type BannerActionType = (typeof BannerAction)[keyof typeof BannerAction];
export type BannerStatusType = (typeof BannerStatus)[keyof typeof BannerStatus];

// === Базовые поля, сохраняемые в БД ===
export interface IBanner {
  _id: Types.ObjectId;
  title: string;
  subtitle?: string;
  description?: string;
  media: string[];
  action: BannerActionType;
  actionPayload?: string;
  startAt: Date;
  endAt: Date | null;
  repeatable: boolean;
  priority: number;
  targeting: {
    roles: string[];
  };
  status: BannerStatusType;
  isSystem: boolean;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type IBannerMethods = {};

// === Статические методы модели ===
export interface IBannerModel extends Model<IBanner, {}, IBannerMethods> {
  // например: findActive(): Promise<BannerDocument[]>;
}

// === Тип документа с методами ===
export type BannerDocument = HydratedDocument<IBanner, IBannerMethods>;
