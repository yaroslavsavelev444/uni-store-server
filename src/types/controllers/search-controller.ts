import type { Query } from "express-serve-static-core";
import type { AuthRequest } from "../auth.js";
import type { IProduct } from "../product.types.js";

// ========== QUERY ==========
export interface GetHintsQuery extends Query {
  q?: string;
}

export interface SearchProductsQuery extends Query {
  q?: string;
  category?: string;
  limit?: string;
  page?: string;
}

// Для валидированного запроса (отдельно, без наследования)
export interface SearchProductsValidatedQuery {
  q: string;
  category?: string;
  limit: number;
  page: number;
}

// ========== BODY ==========
export interface SaveSearchHistoryBody {
  productId: string | { selectedProductId: string };
}

// ========== RESPONSES ==========
export interface SaveSearchHistoryResponse {
  _id: string;
  userId: string;
  selectedProductId: string;
  createdAt: string;
  updatedAt: string;
}

export type GetSearchHistoryResponse = Array<{
  _id: string;
  userId: string;
  selectedProductId: {
    _id: string;
    title: string;
    sku: string;
  };
  createdAt: string;
  updatedAt: string;
}>;

export interface ClearSearchHistoryResponse {
  acknowledged: boolean;
  deletedCount: number;
}

export interface HintItem {
  value: string;
  label: string;
  sku: string;
  price: number;
  originalPrice: number | null;
  hasDiscount: boolean;
  image?: string;
  category?: string;
  isPreorder: boolean;
}

export interface GetHintsResponse {
  success: boolean;
  data: HintItem[];
}

export interface SearchProductsResponse {
  success: boolean;
  data: IProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ========== TYPED REQUESTS ==========
export type SaveSearchHistoryReq = AuthRequest<
  Record<string, never>,
  SaveSearchHistoryResponse,
  SaveSearchHistoryBody,
  Record<string, never>
>;

export type GetSearchHistoryReq = AuthRequest<
  Record<string, never>,
  GetSearchHistoryResponse,
  Record<string, never>,
  Record<string, never>
>;

export type ClearSearchHistoryReq = AuthRequest<
  Record<string, never>,
  ClearSearchHistoryResponse,
  Record<string, never>,
  Record<string, never>
>;

export type GetHintsReq = AuthRequest<
  Record<string, never>,
  GetHintsResponse,
  Record<string, never>,
  GetHintsQuery
>;

// Для searchProducts используем специальный тип с validatedQuery
import type { Request } from "express";
export interface SearchProductsReq extends Request {
  user: { id: string; email: string; role: string };
  validatedQuery?: SearchProductsValidatedQuery;
}
