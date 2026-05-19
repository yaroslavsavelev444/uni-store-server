// types/discount-controller.ts
import type { AuthRequest } from "../auth.js";
import type { IDiscountDocument } from "../discount.types.js";

// Базовый формат ответа
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

// Параметры маршрута
export interface IdParam {
  id: string;
}

// Тело запроса для создания скидки
export interface CreateDiscountBody {
  name: string;
  description?: string;
  type: "percentage" | "fixed" | "quantity_based";
  discountPercent: number;
  fixedAmount?: number;
  minTotalQuantity?: number;
  minTotalAmount?: number;
  appliesToAllProducts: boolean;
  applicableCategories?: string[];
  applicableProducts?: string[];
  isActive?: boolean;
  isUnlimited?: boolean;
  startAt?: string | Date;
  endAt?: string | Date | null;
  priority?: number;
  code?: string;
}

// Тело запроса для обновления скидки (все поля частичные)
export type UpdateDiscountBody = Partial<CreateDiscountBody>;

// Тело для изменения статуса
export interface ChangeStatusBody {
  isActive: boolean;
}

// Тело для getForCart
export interface GetForCartBody {
  cartId: string;
}

// Query параметры для getAll
export interface GetAllDiscountsQuery {
  search?: string;
  type?: string;
  isActive?: string | boolean;
  isCurrentlyActive?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// Типизированные запросы (требуют авторизации)
export type CreateDiscountReq = AuthRequest<
  {},
  ApiResponse<IDiscountDocument>,
  CreateDiscountBody,
  {}
>;
export type UpdateDiscountReq = AuthRequest<
  IdParam,
  ApiResponse<IDiscountDocument>,
  UpdateDiscountBody,
  {}
>;
export type ChangeStatusReq = AuthRequest<
  IdParam,
  ApiResponse<IDiscountDocument>,
  ChangeStatusBody,
  {}
>;
export type RemoveDiscountReq = AuthRequest<
  IdParam,
  ApiResponse<{ success: boolean; message: string }>,
  {},
  {}
>;

// Публичные запросы (авторизация не обязательна)
import type { Request } from "express";
export type GetDiscountByIdReq = Request<
  IdParam,
  ApiResponse<IDiscountDocument>,
  {},
  {}
>;
export type GetAllDiscountsReq = Request<
  {},
  ApiResponse<{ discounts: IDiscountDocument[]; pagination: any }>,
  {},
  GetAllDiscountsQuery
>;
export type GetForCartReq = Request<
  {},
  ApiResponse<{ discounts: any[]; totalApplicable: number }>,
  GetForCartBody,
  {}
>;
