// types/banner-stats-controller.ts
import type { AuthRequest } from "../auth.js"; // предполагаемый путь
import type { BannerViewDocument } from "../bannerView.types.js";

// Общий формат ответа для этого контроллера
export interface StatsResponse<T = unknown> {
  success: boolean;
  data?: T;
}

// Параметры маршрута (id баннера)
export interface IdParam {
  id: string;
}

// Тип ответа сервиса для всех методов
export interface StatsServiceResult {
  action: string;
  view: BannerViewDocument;
}

// Типизированные запросы
export type MarkViewedReq = AuthRequest<
  IdParam,
  StatsResponse<StatsServiceResult>,
  {},
  {}
>;
export type MarkClickedReq = AuthRequest<
  IdParam,
  StatsResponse<StatsServiceResult>,
  {},
  {}
>;
export type MarkDismissedReq = AuthRequest<
  IdParam,
  StatsResponse<StatsServiceResult>,
  {},
  {}
>;
