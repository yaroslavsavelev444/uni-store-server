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

const imageSchema = Joi.object<ImageData>({
  url: Joi.string().required(),
  alt: Joi.string().max(255),
  size: Joi.number().integer().positive(),
  mimetype: Joi.string().valid(
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ),
});

export const createCategorySchema = Joi.object<CreateCategoryBody>({
  name: Joi.string().required().min(2).max(100).trim().messages({
    "string.empty": "Название категории обязательно",
    "string.min": "Название категории должно содержать минимум 2 символа",
    "string.max": "Название категории не должно превышать 100 символов",
  }),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message("Slug может содержать только латинские буквы, цифры и дефисы")
    .optional(),
  subtitle: Joi.string().max(200).trim().optional(),
  description: Joi.string().max(2000).trim().optional(),
  image: Joi.string().allow(null, ""),
  order: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
  metaTitle: Joi.string().max(255).optional(),
  metaDescription: Joi.string().max(500).optional(),
  keywords: Joi.array().items(Joi.string().max(50)).optional(),
});

export const updateCategorySchema = Joi.object<UpdateCategoryBody>({
  name: Joi.string().min(2).max(100).trim().optional(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message("Slug может содержать только латинские буквы, цифры и дефисы")
    .optional(),
  subtitle: Joi.string().max(200).trim().optional(),
  description: Joi.string().max(2000).trim().optional(),
  image: Joi.alternatives([
    imageSchema,
    Joi.string().allow(null, ""),
  ]).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
  metaTitle: Joi.string().max(255).optional(),
  metaDescription: Joi.string().max(500).optional(),
  keywords: Joi.array().items(Joi.string().max(50)).optional(),
}).min(1);

export const categoryQuerySchema = Joi.object<CategoryQueryParams>({
  active: Joi.boolean(),
  search: Joi.string(),
  sortBy: Joi.string().valid("name", "order", "createdAt", "productCount"),
  sortOrder: Joi.string().valid("asc", "desc").default("asc"),
  includeInactive: Joi.boolean().default(false),
  withProductCount: Joi.boolean().default(true),
});

export const categoryListQuerySchema = Joi.object<CategoryListQueryParams>({
  includeInactive: Joi.boolean().default(false),
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
