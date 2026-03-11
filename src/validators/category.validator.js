import {
  alternatives,
  array,
  boolean,
  number,
  object,
  string,
  valid,
} from "joi";

// Упрощенная схема для изображения
const imageSchema = object({
  url: string().required(),
  alt: string().max(255).optional(),
  size: number().integer().positive().optional(),
  mimetype: string()
    .valid("image/jpeg", "image/png", "image/webp", "image/gif")
    .optional(),
}).optional();

// Схема для создания категории
const createCategorySchema = object({
  name: string().required().min(2).max(100).trim().messages({
    "string.empty": "Название категории обязательно",
    "string.min": "Название категории должно содержать минимум 2 символа",
    "string.max": "Название категории не должно превышать 100 символов",
  }),

  slug: string()
    .optional()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message("Slug может содержать только латинские буквы, цифры и дефисы"),

  subtitle: string().optional().max(200).trim(),

  description: string().optional().max(2000).trim(),

  // Упрощаем - изображение полностью опциональное
  image: alternatives().try(imageSchema, string(), valid(null, "")).optional(),

  order: number().integer().min(0).default(0),

  isActive: boolean().default(true),

  metaTitle: string().max(255).optional(),

  metaDescription: string().max(500).optional(),

  keywords: array().items(string().max(50)).optional(),
});

// Схема для обновления категории
const updateCategorySchema = object({
  name: string().min(2).max(100).trim().optional(),

  slug: string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message("Slug может содержать только латинские буквы, цифры и дефисы")
    .optional(),

  subtitle: string().max(200).trim().optional(),

  description: string().max(2000).trim().optional(),

  // Аналогично для обновления
  image: alternatives().try(imageSchema, string(), valid(null, "")).optional(),

  order: number().integer().min(0).optional(),

  isActive: boolean().optional(),

  metaTitle: string().max(255).optional(),

  metaDescription: string().max(500).optional(),

  keywords: array().items(string().max(50)).optional(),
}).min(1);
// Схема для запроса списка категорий
const categoryQuerySchema = object({
  active: boolean(),
  search: string(),
  sortBy: string().valid("name", "order", "createdAt", "productCount"),
  sortOrder: string().valid("asc", "desc").default("asc"),
  includeInactive: boolean().default(false),
  withProductCount: boolean().default(true),
});

// Схема для list запроса (вместо tree)
const categoryListQuerySchema = object({
  includeInactive: boolean().default(false),
});

// Middleware валидации
const validateCategory = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
  }

  req.validatedData = value;
  next();
};

// Middleware валидации query параметров
const validateCategoryQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
  }

  req.validatedQuery = value;
  next();
};

export default {
  createCategorySchema,
  updateCategorySchema,
  categoryQuerySchema,
  categoryListQuerySchema,
  validateCategory,
  validateCategoryQuery,
};
