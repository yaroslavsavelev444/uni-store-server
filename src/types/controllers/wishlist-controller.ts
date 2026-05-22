// types/wishlist-controller.ts
import type { Query } from "express-serve-static-core";
import type { Types } from "mongoose";
import type { AuthRequest } from "../auth.js";

// ===== Вспомогательные типы для товара =====
// Минимальный интерфейс товара в избранном (на основе ответа сервиса)
export interface WishlistProductResponse {
  _id: Types.ObjectId | string;
  title: string;
  sku: string;
  priceForIndividual: number;
  discount?: {
    isActive?: boolean;
    percentage?: number;
    amount?: number;
    validFrom?: Date;
    validUntil?: Date;
    minQuantity?: number;
  };
  status: "available" | "unavailable" | "preorder" | "archived";
  isVisible: boolean;
  mainImage?: string;
  manufacturer?: string;
  category?: { _id: Types.ObjectId; name: string; slug: string };
  specifications?: Array<{
    name: string;
    value: any;
    unit?: string;
    group?: string;
    isVisible?: boolean;
  }>;
  weight?: number;
  warrantyMonths?: number;
  viewsCount: number;
  purchasesCount: number;
  addedToWishlistAt: Date;
  wishlistNotes: string;
  finalPriceForIndividual: number;
}

// Сводка по избранному
export interface WishlistSummaryResponse {
  totalItems: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalPreorder: number;
  hasPriceDrops: boolean;
  totalPrice: number;
  totalDiscount: number;
}

// Пагинированный ответ
export interface PaginatedWishlistResponse {
  products: WishlistProductResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Тело запроса добавления/переключения товара
export interface AddProductBody {
  productId: string;
  notes?: string;
}

// Параметры URL для методов с productId
export interface ProductIdParams {
  productId: string;
}

// Query параметры пагинации
export interface PaginationQuery extends Query {
  page?: string;
  limit?: string;
  sortBy?: "addedAt" | "price" | "name" | "popularity";
  sortOrder?: "asc" | "desc";
}

// Тип ответа для toggleProduct
export interface ToggleProductResponse {
  products: WishlistProductResponse[];
  action: "added" | "removed";
  message: string;
}

// ===== Типизированные запросы =====
export type GetWishlistReq = AuthRequest<{}, WishlistProductResponse[], {}, {}>;
export type AddProductReq = AuthRequest<
  {},
  WishlistProductResponse[],
  AddProductBody,
  {}
>;
export type RemoveProductReq = AuthRequest<
  ProductIdParams,
  WishlistProductResponse[],
  {},
  {}
>;
export type ClearWishlistReq = AuthRequest<
  {},
  WishlistProductResponse[],
  {},
  {}
>;
export type ToggleProductReq = AuthRequest<
  {},
  ToggleProductResponse,
  AddProductBody,
  {}
>;
export type GetSummaryReq = AuthRequest<{}, WishlistSummaryResponse, {}, {}>;
export type IsInWishlistReq = AuthRequest<
  ProductIdParams,
  { isInWishlist: boolean },
  {},
  {}
>;
export type GetProductIdsReq = AuthRequest<{}, string[], {}, {}>;
export type GetCountReq = AuthRequest<{}, { count: number }, {}, {}>;
export type GetPaginatedReq = AuthRequest<
  {},
  PaginatedWishlistResponse,
  {},
  PaginationQuery
>;
