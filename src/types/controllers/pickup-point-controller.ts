import type { Query } from "express-serve-static-core";
import type { AuthRequest } from "../auth.js";
import type { IPickupPoint } from "../pickupPoint.types.js";

// ========== PARAMS ==========
export interface PickupPointIdParams {
  id: string;
}

// ========== QUERY ==========
export interface GetPickupPointsQuery extends Query {
  includeInactive?: string;
}

// ========== BODY ==========
export interface CreatePickupPointBody {
  name: string;
  address: {
    street: string;
    city: string;
    postalCode?: string;
    country?: string;
  };
  coordinates?: { lat?: number; lng?: number };
  workingHours?: string;
  contact?: { phone?: string; email?: string };
  description?: string;
  isActive?: boolean;
  isMain?: boolean;
  orderIndex?: number;
}

export interface UpdatePickupPointBody {
  name?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  coordinates?: { lat?: number; lng?: number };
  workingHours?: string;
  contact?: { phone?: string; email?: string };
  description?: string;
  isActive?: boolean;
  isMain?: boolean;
  orderIndex?: number;
}

export interface UpdateOrderBody {
  orderedIds: string[];
}

// ========== RESPONSES ==========
export type GetPickupPointsResponse = IPickupPoint[];
export type GetPickupPointResponse = IPickupPoint;
export type CreatePickupPointResponse = IPickupPoint;
export type UpdatePickupPointResponse = IPickupPoint;
export type DeletePickupPointResponse = { success: boolean; message: string };
export type ToggleStatusResponse = IPickupPoint;
export type SetMainResponse = IPickupPoint;
export type UpdateOrderResponse = { success: boolean; message: string };

// ========== TYPED REQUESTS (PUBLIC - без авторизации) ==========
// Для публичных эндпоинтов используем обычный Request, но для единообразия создаём типы без user
// В контроллере будем использовать Express.Request, но можно и AuthRequest с optional, проще использовать Request напрямую.
// Однако следуя примеру, лучше определить отдельные типы без user.
import type { Request } from "express";
export type GetPickupPointsReq = Request<
  {},
  GetPickupPointsResponse,
  {},
  GetPickupPointsQuery
>;
export type GetMainPickupPointReq = Request<{}, GetPickupPointResponse, {}, {}>;
export type GetPickupPointReq = Request<
  PickupPointIdParams,
  GetPickupPointResponse,
  {},
  {}
>;

// ========== TYPED REQUESTS (ADMIN - с авторизацией) ==========
export type CreatePickupPointReq = AuthRequest<
  {},
  CreatePickupPointResponse,
  CreatePickupPointBody,
  {}
>;
export type UpdatePickupPointReq = AuthRequest<
  PickupPointIdParams,
  UpdatePickupPointResponse,
  UpdatePickupPointBody,
  {}
>;
export type DeletePickupPointReq = AuthRequest<
  PickupPointIdParams,
  DeletePickupPointResponse,
  {},
  {}
>;
export type ToggleStatusReq = AuthRequest<
  PickupPointIdParams,
  ToggleStatusResponse,
  {},
  {}
>;
export type SetMainReq = AuthRequest<
  PickupPointIdParams,
  SetMainResponse,
  {},
  {}
>;
export type UpdateOrderReq = AuthRequest<
  {},
  UpdateOrderResponse,
  UpdateOrderBody,
  {}
>;
