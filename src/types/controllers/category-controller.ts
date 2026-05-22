// types/controllers/category-controller.ts (дополнение — убедитесь, что эти типы определены)
import type { Query } from "express-serve-static-core";
import type { AuthRequest } from "../auth.js";
import type { ICategory } from "../category.types.js";

// Query параметры для списка категорий
export interface GetAllCategoriesQuery extends Query {
  active?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  includeInactive?: string;
  withProductCount?: string;
}

export interface CategoryListQueryParams extends Query {
  includeInactive?: string;
}

// Базовый ответ
export interface CategoryResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  count?: number;
}

// Типизированные запросы (пример)
export type GetAllCategoriesReq = AuthRequest<
  {},
  CategoryResponse<ICategory[]>,
  {},
  GetAllCategoriesQuery
> & {
  validatedQuery?: GetAllCategoriesQuery;
};

export type GetCategoryListReq = AuthRequest<
  {},
  CategoryResponse<ICategory[]>,
  {},
  CategoryListQueryParams
> & {
  validatedQuery?: CategoryListQueryParams;
};

export type GetCategoryByIdReq = AuthRequest<
  { id: string },
  CategoryResponse<ICategory>,
  {},
  { includeInactive?: string }
>;

export type GetCategoryBySlugReq = AuthRequest<
  { slug: string },
  CategoryResponse<ICategory>,
  {},
  { includeInactive?: string }
>;

export type CreateCategoryReq = AuthRequest<
  {},
  CategoryResponse<ICategory>,
  Partial<ICategory>,
  {}
> & {
  validatedData?: Partial<ICategory>;
};

export type UpdateCategoryReq = AuthRequest<
  { id: string },
  CategoryResponse<ICategory>,
  Partial<ICategory>,
  {}
> & {
  validatedData?: Partial<ICategory>;
};

export type DeleteCategoryReq = AuthRequest<
  { id: string },
  CategoryResponse<{ message: string }>,
  {},
  {}
>;

export type GetProductCountReq = AuthRequest<
  { id: string },
  CategoryResponse<{ count: number }>,
  {},
  {}
>;
