// types/content-block-controller.ts
import type { AuthRequest } from "../auth.js";
import type { IContentBlockDocument } from "../contentBlock.types.js";

// Единый формат ответа
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

// Параметры маршрута
export interface IdParam {
  id: string;
}

export interface TagParam {
  tag: string;
}

// Query для getAll
export interface GetAllQuery {
  includeInactive?: string; // 'true' | 'false'
}

// Тело запроса для создания блока
export interface CreateBlockBody {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  button?: IContentBlockDocument["button"];
  description?: string;
  position?: number;
  isActive?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// Тело запроса для обновления блока (все поля частичные)
export interface UpdateBlockBody extends Partial<CreateBlockBody> {
  tempImagePath?: string | null;
}

// Тело для toggleActive
export interface ToggleActiveBody {
  isActive: boolean;
}

// Типизированные запросы (все требуют авторизации)
export type GetAllReq = AuthRequest<
  {},
  ApiResponse<IContentBlockDocument[]>,
  {},
  GetAllQuery
>;
export type GetByIdReq = AuthRequest<
  IdParam,
  ApiResponse<IContentBlockDocument>,
  {},
  {}
>;
export type GetByTagReq = AuthRequest<
  TagParam,
  ApiResponse<IContentBlockDocument[]>,
  {},
  {}
>;
export type CreateReq = AuthRequest<
  {},
  ApiResponse<IContentBlockDocument>,
  CreateBlockBody,
  {}
>;
export type UpdateReq = AuthRequest<
  IdParam,
  ApiResponse<IContentBlockDocument>,
  UpdateBlockBody,
  {}
>;
export type DeleteReq = AuthRequest<IdParam, never, {}, {}>;
export type ToggleActiveReq = AuthRequest<
  IdParam,
  ApiResponse<IContentBlockDocument>,
  ToggleActiveBody,
  {}
>;
export type GetStatsReq = AuthRequest<
  {},
  ApiResponse<{
    total: number;
    active: number;
    inactive: number;
    withImages: number;
    withButtons: number;
    withoutImages: number;
    withoutButtons: number;
  }>,
  {},
  {}
>;
