// types/transportCompany-controller.ts
import type { Request } from "express";
import type { AuthRequest } from "../auth.js";
import type { ITransportCompany } from "../transportCompany.types.js";

// === Параметры URL ===
export interface IdParams {
  id: string;
}

// === Тело запроса для создания ===
export interface CreateCompanyBody {
  name: string;
  isActive?: boolean;
}

// === Тело запроса для обновления ===
export interface UpdateCompanyBody {
  name?: string;
  isActive?: boolean;
}

// === Ответ при удалении ===
export interface DeleteCompanyResponse {
  success: boolean;
}

// === Публичные запросы (без авторизации) ===
export type GetActiveReq = Request<{}, ITransportCompany[], {}, {}>;

// === Запросы для администратора (требуют авторизации и прав admin) ===
export type GetAllReq = AuthRequest<{}, ITransportCompany[], {}, {}>;
export type CreateReq = AuthRequest<
  {},
  ITransportCompany,
  CreateCompanyBody,
  {}
>;
export type UpdateReq = AuthRequest<
  IdParams,
  ITransportCompany,
  UpdateCompanyBody,
  {}
>;
export type DeleteReq = AuthRequest<IdParams, DeleteCompanyResponse, {}, {}>;
