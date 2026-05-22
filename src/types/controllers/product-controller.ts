import type { Request } from "express";
import type { AuthRequest } from "../auth.js";
import type { IProduct, ProductStatusType } from "../product.types.js";

// ========== PARAMS ==========
export interface ProductIdParams {
  id: string;
}

export interface ProductSkuParams {
  sku: string;
}

export interface CategoryIdParams {
  categoryId: string;
}

// ========== QUERY ==========
export interface GetAllProductsQuery {
  category?: string;
  status?: ProductStatusType;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  excludeIds?: string | string[];
  showOnMainPage?: boolean;
  manufacturer?: string;
  warrantyMonths?: number;
}

export interface GetProductByIdQuery {
  populate?: "none" | "relatedProducts" | "all" | "category";
}

export interface GetProductBySkuQuery {
  populate?: string;
}

export interface GetSimilarProductsQuery {
  limit?: number;
  strategy?: "category" | "price" | "mixed";
}

export interface GetProductsByCategoryQuery {
  limit?: number;
  excludeIds?: string | string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetRelatedProductsQuery {
  limit?: number;
}

// ========== BODY ==========
export interface CreateProductBody {
  sku: string;
  title: string;
  description: string;
  priceForIndividual: number;
  category: string;
  discount?: {
    isActive?: boolean;
    percentage?: number;
    amount?: number;
    validFrom?: Date;
    validUntil?: Date;
    minQuantity?: number;
  };
  status?: ProductStatusType;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  isVisible?: boolean;
  showOnMainPage?: boolean;
  images?: string[];
  instruction: string;
  specifications?: Array<{
    name: string;
    value: unknown;
    unit?: string;
    group?: string;
    isVisible?: boolean;
  }>;
  customAttributes?: Record<string, unknown>;
  relatedProducts?: string[];
  upsellProducts?: string[];
  crossSellProducts?: string[];
  weight?: number;
  dimensions?: { length?: number; width?: number; height?: number };
  manufacturer?: string;
  warrantyMonths?: number;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
}

export type UpdateProductBody = Partial<CreateProductBody>;

export interface UpdateProductStatusBody {
  status: ProductStatusType;
}

export interface AddRelatedProductBody {
  relatedProductId: string;
}

// ========== RESPONSES ==========
export interface ProductListResponse {
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

export interface ProductResponse {
  success: boolean;
  message?: string;
  data: IProduct;
}

export interface CreateProductResponse {
  success: boolean;
  message: string;
  data: IProduct;
}

export interface UpdateProductResponse {
  success: boolean;
  message: string;
  data: IProduct;
}

export interface DeleteProductResponse {
  success: boolean;
  message: string;
}

export interface SimilarProductsResponse {
  success: boolean;
  data: IProduct[];
}

export interface RelatedProductsResponse {
  success: boolean;
  data: IProduct[];
}

export interface ProductStatusesResponse {
  success: boolean;
  data: Array<{ key: string; value: ProductStatusType; label: string }>;
}

// ========== TYPED REQUESTS (с кастомными полями от мидлварей) ==========
// Расширяем базовый Request, добавляя validatedQuery и validatedData
//@ts-expect-error
interface ValidatedRequest<TQuery = any, TBody = any> extends Request {
  validatedQuery?: TQuery;
  validatedData?: TBody;
}

// Публичные запросы (без авторизации)
export type GetAllProductsReq = ValidatedRequest<GetAllProductsQuery, never>;
export type GetProductByIdReq = Request<
  ProductIdParams,
  any,
  any,
  GetProductByIdQuery
>;
export type GetProductBySkuReq = Request<
  ProductSkuParams,
  any,
  any,
  GetProductBySkuQuery
>;
export type GetSimilarProductsReq = Request<
  ProductIdParams,
  any,
  any,
  GetSimilarProductsQuery
>;
export type GetProductsByCategoryReq = Request<
  CategoryIdParams,
  any,
  any,
  GetProductsByCategoryQuery
>;
export type GetRelatedProductsReq = Request<
  ProductIdParams,
  any,
  any,
  GetRelatedProductsQuery
>;

// Админские запросы (с авторизацией)
export type CreateProductReq = AuthRequest<
  {},
  CreateProductResponse,
  CreateProductBody,
  {}
> & {
  validatedData?: CreateProductBody;
};
export type UpdateProductReq = AuthRequest<
  ProductIdParams,
  UpdateProductResponse,
  UpdateProductBody,
  {}
> & {
  validatedData?: UpdateProductBody;
};
export type UpdateProductStatusReq = AuthRequest<
  ProductIdParams,
  ProductResponse,
  UpdateProductStatusBody,
  {}
> & {
  validatedData?: UpdateProductStatusBody;
};
export type AddRelatedProductReq = AuthRequest<
  ProductIdParams,
  ProductResponse,
  AddRelatedProductBody,
  {}
> & {
  validatedData?: AddRelatedProductBody;
};
// Для получения статусов – может быть публичным или админским, оставим с опциональной авторизацией
export type GetProductStatusesReq = Request;
