import type { Request } from "express";
import type { AuthRequest } from "../auth.js";
import type { IContentBlockDocument } from "../contentBlock.types.js";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface IdParam {
  id: string;
}

export interface TagParam {
  tag: string;
}

export interface GetAllQuery {
  includeInactive?: string;
}

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

export interface UpdateBlockBody extends Partial<CreateBlockBody> {
  tempImagePath?: string | null;
}

export interface ToggleActiveBody {
  isActive: boolean;
}

// Публичные методы (без авторизации) – обычный Request
export type GetAllReq = Request<
  {},
  ApiResponse<IContentBlockDocument[]>,
  {},
  GetAllQuery
>;
export type GetByIdReq = Request<
  IdParam,
  ApiResponse<IContentBlockDocument>,
  {},
  {}
>;
export type GetByTagReq = Request<
  TagParam,
  ApiResponse<IContentBlockDocument[]>,
  {},
  {}
>;
export type GetStatsReq = Request<
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

// Административные методы (требуют user)
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
