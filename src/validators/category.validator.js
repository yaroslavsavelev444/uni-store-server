const Joi = require('joi');

// Упрощенная схема для изображения
const imageSchema = Joi.object({
  url: Joi.string().pattern(/^\/uploads\/.+\.(jpg|jpeg|png|webp|gif)$/i)
    .message('Изображение должно быть из папки uploads'),
  alt: Joi.string().max(255).optional(),
  size: Joi.number().integer().positive().optional(),
  mimetype: Joi.string().valid('image/jpeg', 'image/png', 'image/webp', 'image/gif').optional()
}).optional();

// Схема для создания категории
const createCategorySchema = Joi.object({
  name: Joi.string()
    .required()
    .min(2)
    .max(100)
    .trim()
    .messages({
      'string.empty': 'Название категории обязательно',
      'string.min': 'Название категории должно содержать минимум 2 символа',
      'string.max': 'Название категории не должно превышать 100 символов'
    }),
  
  slug: Joi.string()
    .optional()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message('Slug может содержать только латинские буквы, цифры и дефисы'),
  
  subtitle: Joi.string()
    .optional()
    .max(200)
    .trim(),
  
  description: Joi.string()
    .optional()
    .max(2000)
    .trim(),
  
  // Упрощаем - изображение полностью опциональное
  image: Joi.alternatives()
    .try(
      imageSchema,
      Joi.string()
        .pattern(/^\/uploads\/.+\.(jpg|jpeg|png|webp|gif)$/i)
        .message('Изображение должно быть из папки uploads'),
      Joi.valid(null, '') // Разрешаем null и пустую строку
    )
    .optional(),
  
  order: Joi.number()
    .integer()
    .min(0)
    .default(0),
  
  isActive: Joi.boolean()
    .default(true),
  
  
  metaTitle: Joi.string()
    .max(255)
    .optional(),
  
  metaDescription: Joi.string()
    .max(500)
    .optional(),
  
  keywords: Joi.array()
    .items(Joi.string().max(50))
    .optional()
});

// Схема для обновления категории
const updateCategorySchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .optional(),
  
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .message('Slug может содержать только латинские буквы, цифры и дефисы')
    .optional(),
  
  subtitle: Joi.string()
    .max(200)
    .trim()
    .optional(),
  
  description: Joi.string()
    .max(2000)
    .trim()
    .optional(),
  
  // Аналогично для обновления
  image: Joi.alternatives()
    .try(
      imageSchema,
      Joi.string()
        .pattern(/^\/uploads\/.+\.(jpg|jpeg|png|webp|gif)$/i)
        .message('Изображение должно быть из папки uploads'),
      Joi.valid(null, '') // Разрешаем null и пустую строку
    )
    .optional(),
  
  order: Joi.number()
    .integer()
    .min(0)
    .optional(),
  
  isActive: Joi.boolean()
    .optional(),
  
  
  metaTitle: Joi.string()
    .max(255)
    .optional(),
  
  metaDescription: Joi.string()
    .max(500)
    .optional(),
  
  keywords: Joi.array()
    .items(Joi.string().max(50))
    .optional()
}).min(1);
// Схема для запроса списка категорий
const categoryQuerySchema = Joi.object({
  active: Joi.boolean(),
  search: Joi.string(),
  sortBy: Joi.string().valid('name', 'order', 'createdAt', 'productCount'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  includeInactive: Joi.boolean().default(false),
  withProductCount: Joi.boolean().default(true)
});

// Схема для list запроса (вместо tree)
const categoryListQuerySchema = Joi.object({
  includeInactive: Joi.boolean().default(false)
});

// Middleware валидации
const validateCategory = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    });
  }
  
  req.validatedData = value;
  next();
};

// Middleware валидации query параметров
const validateCategoryQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    });
  }
  
  req.validatedQuery = value;
  next();
};

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  categoryQuerySchema,
  categoryListQuerySchema,
  validateCategory,
  validateCategoryQuery
};