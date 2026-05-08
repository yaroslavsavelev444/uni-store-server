import type { Document, Model, Types } from "mongoose";

// === Интерфейс документа ===
export interface IBannerView {
  bannerId: Types.ObjectId; // ссылка на Banner
  userId: Types.ObjectId; // ссылка на User

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

// === Виртуальные поля ===
export interface IBannerViewVirtuals {
  ctr: number; // Computed CTR (0 или 1)
}

// === Методы экземпляра ===
export interface IBannerViewMethods {
  incrementView(): Promise<IBannerViewDocument>;
}

// === Статические методы ===
export interface BannerViewModelType extends Model<
  IBannerViewDocument,
  {},
  IBannerViewMethods
> {
  getStats(
    bannerId: string | Types.ObjectId,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]>; // уточнить тип результата агрегации
}

// === Итоговый тип документа (включает виртуалы и методы) ===
export type IBannerViewDocument = Document<unknown, {}, IBannerView> &
  IBannerView &
  IBannerViewVirtuals &
  IBannerViewMethods;
