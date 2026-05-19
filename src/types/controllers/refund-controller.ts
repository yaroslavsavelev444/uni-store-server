// types/refund-controller.ts
import type { Query } from "express-serve-static-core";
import type { AuthRequest } from "../auth.js";
import type {
  AddAdminNoteInput,
  AdminGetRefundsQuery,
  CreateRefundInput,
  GetRefundsQuery,
  PaginatedRefundsResponse,
  RefundResponse,
  RefundStatsResponse,
  UpdateRefundStatusInput,
} from "../refund-service.types.js";

// ==================== Базовые расширения для validatedData / validatedQuery ====================
// (предполагается, что middleware валидации добавляет эти поля)

// ==================== Типы параметров URL ====================
export interface RefundIdParams {
  id: string;
}

// ==================== Типы тела запроса (validatedData) ====================
export type CreateRefundBody = CreateRefundInput;
export type UpdateRefundStatusBody = UpdateRefundStatusInput;
export type AssignToAdminBody = {
  adminId: string;
  adminName: string;
};
export type AddAdminNoteBody = AddAdminNoteInput;

// ==================== Типы query параметров (validatedQuery) ====================
export type GetUserRefundsQuery = GetRefundsQuery;
export type GetAllRefundsQuery = AdminGetRefundsQuery;
export interface GetRefundStatsQuery extends Query {
  timeframe?: "day" | "week" | "month" | "year";
}

// ==================== Типы ответов (обёрнутые в единый формат) ====================
export interface BaseSuccessResponse<T = unknown> {
  success: true;
  message?: string;
  data?: T;
  pagination?: PaginatedRefundsResponse["pagination"];
}

export type CreateRefundResponse = BaseSuccessResponse<RefundResponse> & {
  message: string;
};
export type GetUserRefundsResponse = BaseSuccessResponse<RefundResponse[]> & {
  pagination: PaginatedRefundsResponse["pagination"];
};
export type GetRefundByIdResponse = BaseSuccessResponse<RefundResponse>;
export type GetAllRefundsResponse = BaseSuccessResponse<RefundResponse[]> & {
  pagination: PaginatedRefundsResponse["pagination"];
};
export type UpdateRefundStatusResponse = BaseSuccessResponse<RefundResponse> & {
  message: string;
};
export type AssignRefundToAdminResponse =
  BaseSuccessResponse<RefundResponse> & {
    message: string;
  };
export type AddAdminNoteResponse = BaseSuccessResponse<RefundResponse> & {
  message: string;
};
export type GetRefundStatsResponse = BaseSuccessResponse<RefundStatsResponse>;
export type GetRefundReasonsResponse = BaseSuccessResponse<
  Array<{ key: string; label: string }>
>;
export type GetRefundStatusesResponse = BaseSuccessResponse<
  Array<{ key: string; label: string }>
>;

// ==================== Типизированные запросы ====================
// Пользовательские методы
export type CreateRefundReq = AuthRequest<{}, CreateRefundResponse, {}, {}> & {
  validatedData: CreateRefundBody;
};

export type GetUserRefundsReq = AuthRequest<
  {},
  GetUserRefundsResponse,
  {},
  {}
> & {
  validatedQuery: GetUserRefundsQuery;
};

export type GetRefundByIdReq = AuthRequest<
  RefundIdParams,
  GetRefundByIdResponse,
  {},
  {}
>;

// Админские методы
export type GetAllRefundsReq = AuthRequest<
  {},
  GetAllRefundsResponse,
  {},
  {}
> & {
  validatedQuery: GetAllRefundsQuery;
};

export type UpdateRefundStatusReq = AuthRequest<
  RefundIdParams,
  UpdateRefundStatusResponse,
  {},
  {}
> & {
  validatedData: UpdateRefundStatusBody;
};

export type AssignRefundToAdminReq = AuthRequest<
  RefundIdParams,
  AssignRefundToAdminResponse,
  {},
  {}
> & {
  validatedData: AssignToAdminBody;
};

export type AddAdminNoteReq = AuthRequest<
  RefundIdParams,
  AddAdminNoteResponse,
  {},
  {}
> & {
  validatedData: AddAdminNoteBody;
};

export type GetRefundStatsReq = AuthRequest<
  {},
  GetRefundStatsResponse,
  {},
  GetRefundStatsQuery
>;

// Вспомогательные методы (без параметров)
export type GetRefundReasonsReq = AuthRequest<
  {},
  GetRefundReasonsResponse,
  {},
  {}
>;
export type GetRefundStatusesReq = AuthRequest<
  {},
  GetRefundStatusesResponse,
  {},
  {}
>;
