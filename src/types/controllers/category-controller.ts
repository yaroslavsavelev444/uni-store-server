// types/category-controller.ts
import type { AuthRequest, OptionalAuthRequest } from "../auth.js";
import type { ICategory } from "../category.types.js";

// Базовый формат ответа
export interface CategoryResponse<T = unknown> {
  success: boolean;
  data?: T;
  count?: number;
  message?: string;
}

// Параметры маршрута
export interface IdParam {
  id: string;
}

export interface SlugParam {
  slug: string;
}

// Query для getAllCategories
export interface GetAllCategoriesQuery {
  active?: string | boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  includeInactive?: string | boolean;
  withProductCount?: string | boolean;
}

// Query для getCategoryList
export interface GetCategoryListQuery {
  includeInactive?: string | boolean;
}

// Query для getCategoryById и getCategoryBySlug
export interface GetCategoryOptionsQuery {
  includeInactive?: string | boolean;
  withProductCount?: string | boolean;
}

// Тело запроса для создания категории
export interface CreateCategoryBody extends Partial<
  Omit<ICategory, "_id" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt">
> {
  image?: ICategory["image"];
}

// Тело запроса для обновления категории (аналогичное)
export interface UpdateCategoryBody extends Partial<
  Omit<ICategory, "_id" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt">
> {
  image?: ICategory["image"] | null;
}

// Типизированные запросы
export type GetAllCategoriesReq = AuthRequest<
  {},
  CategoryResponse<ICategory[]>,
  {},
  GetAllCategoriesQuery
>;
export type GetCategoryListReq = AuthRequest<
  {},
  CategoryResponse<ICategory[]>,
  {},
  GetCategoryListQuery
>;
export type GetCategoryByIdReq = AuthRequest<
  IdParam,
  CategoryResponse<ICategory>,
  {},
  GetCategoryOptionsQuery
>;
export type GetCategoryBySlugReq = AuthRequest<
  SlugParam,
  CategoryResponse<ICategory>,
  {},
  GetCategoryOptionsQuery
>;
export type CreateCategoryReq = AuthRequest<
  {},
  CategoryResponse<ICategory>,
  CreateCategoryBody,
  {}
>;
export type UpdateCategoryReq = AuthRequest<
  IdParam,
  CategoryResponse<ICategory>,
  UpdateCategoryBody,
  {}
>;
export type DeleteCategoryReq = AuthRequest<
  IdParam,
  CategoryResponse<{ message: string }>,
  {},
  {}
>;
export type GetProductCountReq = AuthRequest<
  IdParam,
  CategoryResponse<{ count: number }>,
  {},
  {}
>;
