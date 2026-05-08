import type { Types } from "mongoose";

// === Enums (более безопасны, чем строки в схеме) ===
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

// === Интерфейс документа ===
export interface IBanner {
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
  createdBy: Types.ObjectId; // ссылка на User
  updatedBy: Types.ObjectId; // ссылка на User
  createdAt?: Date; // от timestamps
  updatedAt?: Date; // от timestamps
}

// (Опционально) методы документа — если появятся, добавить сюда
// export interface IBannerMethods { ... }

// Итоговый тип документа с методами (пока пусто)
export type BannerDocument = IBanner; // в будущем: & Document<...> & IBannerMethods
