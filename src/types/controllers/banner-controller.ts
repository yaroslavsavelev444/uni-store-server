// types/banner-controller.ts

import type { Request } from "express";
import type { AuthRequest } from "../auth.js"; // предполагаемый путь
import type { BannerDocument } from "../banner.types.js";

// Общий формат ответа
export interface CommonResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Параметры маршрута
export interface IdParam {
  id: string;
}

// Тело запроса для создания баннера
export interface CreateBannerBody {
  [key: string]: unknown;
  title: string;
  subtitle?: string;
  description?: string;
  media?: string[];
  action?: string;
  actionPayload?: string;
  startAt?: string | Date;
  endAt?: string | Date | null;
  repeatable?: boolean | string;
  priority?: number | string;
  targeting?: {
    roles?: string | string[];
  };
  status?: string;
}

// Тело запроса для обновления (расширяет создание + удаляемые URL)
export interface UpdateBannerBody extends CreateBannerBody {
  deletedUrls?: string | string[];
}

// Тело запроса для смены статуса
export interface ChangeStatusBody {
  status: string;
}

// Query параметры для списка баннеров
export interface GetAllQuery {
  status?: string;
}

// Типизированные запросы для каждого метода контроллера
export type CreateReq = AuthRequest<
  {},
  CommonResponse<BannerDocument>,
  CreateBannerBody,
  {}
>;
export type UpdateReq = AuthRequest<
  IdParam,
  CommonResponse<BannerDocument>,
  UpdateBannerBody,
  {}
>;
export type GetAllReq = AuthRequest<
  {},
  CommonResponse<BannerDocument[]>,
  {},
  GetAllQuery
>;
export type GetByIdReq = AuthRequest<
  IdParam,
  CommonResponse<BannerDocument>,
  {},
  {}
>;
export type RemoveReq = AuthRequest<IdParam, never, {}, {}>;
export type ChangeStatusReq = AuthRequest<
  IdParam,
  CommonResponse<BannerDocument>,
  ChangeStatusBody,
  {}
>;
export type GetForUserReq = AuthRequest<
  {},
  CommonResponse<BannerDocument[]>,
  {},
  {}
>;
