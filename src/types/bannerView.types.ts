import type { HydratedDocument, Model, Types } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface IBannerView {
  bannerId: Types.ObjectId;
  userId: Types.ObjectId;
  viewedAt: Date | null;
  clicked: boolean;
  clickedAt: Date | null;
  dismissed: boolean;
  dismissedAt: Date | null;
  userAgent?: string;
  ipAddress?: string;
  referrer?: string;
  screenResolution?: string;
  viewCount: number;
  lastViewedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра ===
export interface IBannerViewMethods {
  incrementView(): Promise<BannerViewDocument>;
}

// === Статические методы модели ===
export interface IBannerViewModel extends Model<
  IBannerView,
  {},
  IBannerViewMethods
> {
  getStats(
    bannerId: string | Types.ObjectId,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]>; // можно типизировать точнее, если требуется
}

// === Тип документа с методами ===
export type BannerViewDocument = HydratedDocument<
  IBannerView,
  IBannerViewMethods
>;
