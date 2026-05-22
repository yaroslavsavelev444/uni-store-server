// types/companies-controller.ts
import type { AuthRequest } from "../auth.js";
import type { ICompany } from "../company.types.js";

// Базовый формат ответа
export interface CompanyResponse<T = unknown> {
  success: boolean;
  message?: string;
  count?: number;
  company?: T;
  companies?: T[];
  [key: string]: unknown;
}

// Параметры маршрута
export interface IdParam {
  id: string;
}

export interface TaxNumberParam {
  taxNumber: string;
}

// Тело запроса для создания компании
export interface CreateCompanyBody {
  companyName: string;
  legalAddress: string;
  companyAddress?: string;
  taxNumber: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
}

// Тело запроса для обновления компании (все поля optional)
export interface UpdateCompanyBody extends Partial<CreateCompanyBody> {}

// Query для поиска
export interface SearchCompanyQuery {
  query: string;
}

// Тело запроса для синхронизации кеша
export interface SyncCacheBody {
  userId: string;
}

// Типизированные запросы
export type CreateCompanyReq = AuthRequest<
  {},
  CompanyResponse<ICompany>,
  CreateCompanyBody,
  {}
>;
export type GetCompaniesReq = AuthRequest<
  {},
  CompanyResponse<ICompany[]>,
  {},
  {}
>;
export type GetCompanyByIdReq = AuthRequest<
  IdParam,
  CompanyResponse<ICompany>,
  {},
  {}
>;
export type GetCompanyByTaxNumberReq = AuthRequest<
  TaxNumberParam,
  CompanyResponse<ICompany>,
  {},
  {}
>;
export type UpdateCompanyReq = AuthRequest<
  IdParam,
  CompanyResponse<ICompany>,
  UpdateCompanyBody,
  {}
>;
export type DeleteCompanyReq = AuthRequest<
  IdParam,
  CompanyResponse<{ success: boolean; message: string }>,
  {},
  {}
>;
export type SearchCompaniesReq = AuthRequest<
  {},
  CompanyResponse<ICompany[]>,
  {},
  SearchCompanyQuery
>;
export type GetDefaultCompanyReq = AuthRequest<
  {},
  CompanyResponse<ICompany | null>,
  {},
  {}
>;
export type SyncCacheReq = AuthRequest<
  {},
  CompanyResponse<{ message: string }>,
  SyncCacheBody,
  {}
>;
