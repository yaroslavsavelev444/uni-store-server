import type { NextFunction, Request, Response } from "express";
import Joi from "joi";

// ========== Типы данных ==========
export interface ImageData {
  url: string;
  alt?: string;
  size?: number;
  mimetype?: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export interface CreateCategoryBody {
  name: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  image?: ImageData | string | null;
  order?: number;
  isActive?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
}

export interface UpdateCategoryBody {
  name?: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  image?: ImageData | string | null;
  order?: number;
  isActive?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
}

export interface CategoryQueryParams {
  active?: boolean;
  search?: string;
  sortBy?: "name" | "order" | "createdAt" | "productCount";
  sortOrder?: "asc" | "desc";
  includeInactive?: boolean;
  withProductCount?: boolean;
}

export interface CategoryListQueryParams {
  includeInactive?: boolean;
}

// Расширяем Request для добавления validatedData и validatedQuery
declare global {
  namespace Express {
    interface Request {
      validatedData?: CreateCategoryBody | UpdateCategoryBody;
      validatedQuery?: CategoryQueryParams | CategoryListQueryParams;
    }
  }
}

// ========== Joi Схемы ==========
const { object, string, number, boolean, array, alternatives } = Joi;

const imageSchema = object<ImageData>({
  url: string().required(),
  alt: string().max(255),
  size: number().integer().positive(),
  mimetype: string().valid(
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ),
});

export const createCategorySchema = object<CreateCategoryBody>({
  name: string().required().min(2).max(100).trim().messages({
    "string.empty": "Название категории обязательно",
    "string.min": "Название категории должно содержать минимум 2 символа",
    "string.max": "Название категории не должно превышать 100 символов",
  }),
  slug: string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message("Slug может содержать только латинские буквы, цифры и дефисы")
    .optional(),
  subtitle: string().max(200).trim().optional(),
  description: string().max(2000).trim().optional(),
  image: alternatives([imageSchema, string().allow(null, "")]).optional(),
  order: number().integer().min(0).default(0),
  isActive: boolean().default(true),
  metaTitle: string().max(255).optional(),
  metaDescription: string().max(500).optional(),
  keywords: array().items(string().max(50)).optional(),
});

export const updateCategorySchema = object<UpdateCategoryBody>({
  name: string().min(2).max(100).trim().optional(),
  slug: string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message("Slug может содержать только латинские буквы, цифры и дефисы")
    .optional(),
  subtitle: string().max(200).trim().optional(),
  description: string().max(2000).trim().optional(),
  image: alternatives([imageSchema, string().allow(null, "")]).optional(),
  order: number().integer().min(0).optional(),
  isActive: boolean().optional(),
  metaTitle: string().max(255).optional(),
  metaDescription: string().max(500).optional(),
  keywords: array().items(string().max(50)).optional(),
}).min(1);

export const categoryQuerySchema = object<CategoryQueryParams>({
  active: boolean(),
  search: string(),
  sortBy: string().valid("name", "order", "createdAt", "productCount"),
  sortOrder: string().valid("asc", "desc").default("asc"),
  includeInactive: boolean().default(false),
  withProductCount: boolean().default(true),
});

export const categoryListQuerySchema = object<CategoryListQueryParams>({
  includeInactive: boolean().default(false),
});

// ========== Middleware-валидаторы ==========
export const validateCategory = (
  schema: Joi.ObjectSchema<CreateCategoryBody | UpdateCategoryBody>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      res.status(400).json({
        success: false,
        errors: error.details.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
      return;
    }

    req.validatedData = value;
    next();
  };
};

export const validateCategoryQuery = (
  schema: Joi.ObjectSchema<CategoryQueryParams | CategoryListQueryParams>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      res.status(400).json({
        success: false,
        errors: error.details.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
      return;
    }

    req.validatedQuery = value;
    next();
  };
};
