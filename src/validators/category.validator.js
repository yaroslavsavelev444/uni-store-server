import joi from "joi";

// Упрощенная схема для изображения
const imageSchema = joi
  .object({
    url: joi.string().required(),
    alt: joi.string().max(255).optional(),
    size: joi.number().integer().positive().optional(),
    mimetype: joi
      .string()
      .valid("image/jpeg", "image/png", "image/webp", "image/gif")
      .optional(),
  })
  .optional();

// Схема для создания категории
const createCategorySchema = joi.object({
  name: joi.string().required().min(2).max(100).trim().messages({
    "string.empty": "Название категории обязательно",
    "string.min": "Название категории должно содержать минимум 2 символа",
    "string.max": "Название категории не должно превышать 100 символов",
  }),

  slug: joi
    .string()
    .optional()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message("Slug может содержать только латинские буквы, цифры и дефисы"),

  subtitle: joi.string().optional().max(200).trim(),

  description: joi.string().optional().max(2000).trim(),

  // Упрощаем - изображение полностью опциональное
  image: joi
    .alternatives()
    .try(imageSchema, joi.string(), joi.valid(null, ""))
    .optional(),

  order: joi.number().integer().min(0).default(0),

  isActive: joi.boolean().default(true),

  metaTitle: joi.string().max(255).optional(),

  metaDescription: joi.string().max(500).optional(),

  keywords: joi.array().items(joi.string().max(50)).optional(),
});

// Схема для обновления категории
const updateCategorySchema = joi
  .object({
    name: joi.string().min(2).max(100).trim().optional(),

    slug: joi
      .string()
      .trim()
      .lowercase()
      .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .message("Slug может содержать только латинские буквы, цифры и дефисы")
      .optional(),

    subtitle: joi.string().max(200).trim().optional(),

    description: joi.string().max(2000).trim().optional(),

    // Аналогично для обновления
    image: joi
      .alternatives()
      .try(imageSchema, joi.string(), joi.valid(null, ""))
      .optional(),

    order: joi.number().integer().min(0).optional(),

    isActive: joi.boolean().optional(),

    metaTitle: joi.string().max(255).optional(),

    metaDescription: joi.string().max(500).optional(),

    keywords: joi.array().items(joi.string().max(50)).optional(),
  })
  .min(1);

// Схема для запроса списка категорий
const categoryQuerySchema = joi.object({
  active: joi.boolean(),
  search: joi.string(),
  sortBy: joi.string().valid("name", "order", "createdAt", "productCount"),
  sortOrder: joi.string().valid("asc", "desc").default("asc"),
  includeInactive: joi.boolean().default(false),
  withProductCount: joi.boolean().default(true),
});

// Схема для list запроса (вместо tree)
const categoryListQuerySchema = joi.object({
  includeInactive: joi.boolean().default(false),
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
