const Joi = require('joi');
const { ProductStatus } = require('../models/product-model');

console.log('[VALIDATOR] Загрузка схем валидации продуктов...');

// Вспомогательные схемы для валидации файлов
const imageSchema = Joi.object({
  url: Joi.string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/images\/|https?:\/\/)/)
    .message('Некорректный формат изображения'),
  alt: Joi.string().max(255).optional().allow('', null).default(''),
  order: Joi.number().integer().min(0).optional().default(0)
});

// Схема для инструкции-файла
const instructionFileSchema = Joi.object({
  type: Joi.string().valid('file').required(),
  url: Joi.string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/instructions\/|https?:\/\/)/)
    .message('Некорректный формат файла инструкции'),
  originalName: Joi.string().max(255).required(),
  size: Joi.number().integer().positive().max(50 * 1024 * 1024).required(),
  alt: Joi.string().max(255).optional().allow('', null),
  mimetype: Joi.string().optional()
});

// Схема для инструкции-ссылки
const instructionLinkSchema = Joi.object({
  type: Joi.string().valid('link').required(),
  url: Joi.string()
    .required()
    .uri()
    .message('Некорректный формат ссылки'),
  title: Joi.string().max(255).optional().allow('', null).default('Инструкция')
});

// Общая схема для инструкции (либо файл, либо ссылка)
const instructionSchema = Joi.alternatives()
  .try(instructionFileSchema, instructionLinkSchema)
  .optional()
  .allow(null)
  .default(null);

const createProductSchema = Joi.object({
  sku: Joi.string()
    .required()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      'string.pattern.base': 'SKU может содержать только буквы, цифры, дефисы и подчеркивания'
    }),
  
  title: Joi.string()
    .required()
    .min(3)
    .max(200)
    .trim(),
  
  description: Joi.string()
    .required()
    .min(10)
    .max(5000),
  
  priceForIndividual: Joi.number()
    .required()
    .positive()
    .precision(2)
    .max(100000000),
  
  status: Joi.string()
    .valid(...Object.values(ProductStatus))
    .default(ProductStatus.AVAILABLE),
  
  category: Joi.string()
    .required()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .message('Некорректный ID категории'),
  
  mainImage: Joi.string()
    .uri()
    .pattern(/^(\/uploads\/products\/images\/|https?:\/\/)/)
    .message('Некорректный формат основного изображения')
    .optional()
    .allow('', null),
  
  showOnMainPage: Joi.boolean().default(false),
  
  images: Joi.array()
    .items(imageSchema)
    .max(20)
    .optional()
    .default([]),
    
  instruction: instructionSchema,
  
  specifications: Joi.array()
    .items(Joi.object({
      name: Joi.string().required().max(100),
      value: Joi.any().required(),
      unit: Joi.string().max(20).optional(),
      group: Joi.string().max(50).optional(),
      isVisible: Joi.boolean().default(true)
    }))
    .max(50)
    .optional()
    .default([]),

  customAttributes: Joi.object()
    .pattern(/^[a-zA-Z0-9_]+$/, Joi.any())
    .max(20)
    .optional(),
  
  relatedProducts: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .unique()
    .max(20)
    .optional(),
  
  upsellProducts: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .unique()
    .max(10)
    .optional(),
  
  crossSellProducts: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .unique()
    .max(10)
    .optional(),
  
  weight: Joi.number()
    .positive()
    .max(100000)
    .optional(),
  
  dimensions: Joi.object({
    length: Joi.number().positive().max(10000).optional(),
    width: Joi.number().positive().max(10000).optional(),
    height: Joi.number().positive().max(10000).optional()
  })
  .optional(),
  
  manufacturer: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .default(''),
  
  warrantyMonths: Joi.number()
    .integer()
    .min(0)
    .max(120)
    .optional(),
  
  minOrderQuantity: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(1),
  
  maxOrderQuantity: Joi.number()
    .integer()
    .min(Joi.ref('minOrderQuantity'))
    .max(10000)
    .optional(),
  
  isVisible: Joi.boolean()
    .default(true),
  
  metaTitle: Joi.string()
    .max(255)
    .optional()
    .allow(''),
  
  metaDescription: Joi.string()
    .max(500)
    .optional()
    .allow(''),
  
  keywords: Joi.array()
    .items(Joi.string().max(50))
    .max(20)
    .optional()
})
.with('maxOrderQuantity', 'minOrderQuantity');

const updateProductSchema = createProductSchema.fork(
  Object.keys(createProductSchema.describe().keys),
  (schema) => schema.optional()
).min(1);

const productQuerySchema = Joi.object({
  category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  status: Joi.string().valid(...Object.values(ProductStatus)),
  minPrice: Joi.number().positive().max(1000000),
  maxPrice: Joi.number().positive().max(1000000).min(Joi.ref('minPrice')),
  inStock: Joi.boolean(),
  isAdmin: Joi.boolean(),
  slug: Joi.string().max(100),
  search: Joi.string().max(100),
  sortBy: Joi.string().valid('price', 'title', 'createdAt', 'updatedAt', 'popularity'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  showOnMainPage: Joi.boolean().default(false),
  populate: Joi.string().valid('category', 'relatedProducts', 'all', 'none').default('none'),
  excludeIds: Joi.alternatives().try(
    Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
    Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
  ),
})
.with('maxPrice', 'minPrice');

const productSearchSchema = Joi.object({
  q: Joi.string().min(1).max(100).required(),
  category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  limit: Joi.number().integer().min(1).max(50).default(10),
  page: Joi.number().integer().min(1).default(1)
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(ProductStatus))
    .required()
});

const updateStockSchema = Joi.object({
  quantity: Joi.number().integer().required(),
  operation: Joi.string().valid('set', 'add', 'subtract').default('set'),
  reason: Joi.string().max(500).optional()
});

// Функция для логирования данных и ошибок валидации
const validateProductWithLogging = (schema, data, context = '') => {
  console.log(`[VALIDATOR${context ? ` ${context}` : ''}] Валидация данных:`, {
    timestamp: new Date().toISOString(),
    dataType: typeof data,
    isArray: Array.isArray(data),
    keys: Object.keys(data || {}),
    // Логируем важные поля для отладки проблем с изображениями
    hasImages: !!data?.images,
    imagesCount: Array.isArray(data?.images) ? data.images.length : 0,
    hasMainImage: !!data?.mainImage,
    imageUrls: Array.isArray(data?.images) 
      ? data.images.map(img => ({
          url: img.url ? `${img.url.substring(0, 50)}...` : 'нет',
          alt: img.alt || 'нет'
        }))
      : 'нет изображений'
  });

  // Логируем полные данные (можно ограничить для безопасности)
  console.log(`[VALIDATOR${context ? ` ${context}` : ''}] Полные данные:`, JSON.stringify({
    sku: data.sku,
    title: data.title,
    images: data.images,
    mainImage: data.mainImage,
    // Не логируем все поля для безопасности, только проблемные
    specifications: data.specifications ? `[массив из ${data.specifications.length} элементов]` : 'нет'
  }, null, 2));

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false
  });

  if (error) {
    console.error(`[VALIDATOR${context ? ` ${context}` : ''}] Ошибки валидации:`, {
      timestamp: new Date().toISOString(),
      totalErrors: error.details.length,
      errors: error.details.map(detail => ({
        path: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
        context: detail.context
      })),
      originalData: data
    });

    // Логируем подробную информацию об ошибках
    error.details.forEach((detail, index) => {
      console.error(`[VALIDATOR${context ? ` ${context}` : ''}] Ошибка ${index + 1}:`, {
        field: detail.path.join('.'),
        value: detail.context ? detail.context.value : 'не указано',
        problem: detail.message,
        validationType: detail.type
      });
    });
  } else {
    console.log(`[VALIDATOR${context ? ` ${context}` : ''}] Валидация успешна:`, {
      timestamp: new Date().toISOString(),
      validFields: Object.keys(value).length,
      hasImages: !!value.images,
      imagesCount: Array.isArray(value.images) ? value.images.length : 0
    });
  }

  return { error, value };
};

// Middleware для валидации с логированием
const validateProduct = (schema) => {
  return (req, res, next) => {
    console.log(`[VALIDATOR MIDDLEWARE] Запрос ${req.method} ${req.path}`);
    console.log(`[VALIDATOR MIDDLEWARE] Content-Type: ${req.headers['content-type']}`);
    
    // Логируем заголовки для отладки
    console.log(`[VALIDATOR MIDDLEWARE] Headers:`, {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });

    const data = { ...req.body, ...req.query, ...req.params };
    
    console.log(`[VALIDATOR MIDDLEWARE] Тип запроса: ${req.method}`);
    console.log(`[VALIDATOR MIDDLEWARE] Источник данных:`, {
      body: Object.keys(req.body || {}),
      query: Object.keys(req.query || {}),
      params: Object.keys(req.params || {})
    });

    // Логируем специальные поля для отладки проблем
    if (req.body.images) {
      console.log(`[VALIDATOR MIDDLEWARE] Изображения в запросе:`, {
        count: req.body.images.length,
        firstImage: req.body.images[0] ? {
          url: req.body.images[0].url ? `${req.body.images[0].url.substring(0, 100)}...` : 'нет URL',
          alt: req.body.images[0].alt || 'нет alt',
          _shouldDelete: req.body.images[0]._shouldDelete || false
        } : 'нет изображений',
        allImages: req.body.images.map((img, idx) => ({
          index: idx,
          url: img.url ? `${img.url.substring(0, 50)}...` : 'нет URL',
          shouldDelete: img._shouldDelete || false
        }))
      });
    }

    if (req.body.specifications) {
      console.log(`[VALIDATOR MIDDLEWARE] Спецификации в запросе:`, {
        count: req.body.specifications.length,
        firstSpec: req.body.specifications[0] || 'нет'
      });
    }

    const { error, value } = validateProductWithLogging(
      schema, 
      data,
      `${req.method} ${req.path}`
    );

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      
      console.error(`[VALIDATOR MIDDLEWARE] Возвращаем ошибку клиенту:`, {
        status: 400,
        errors: errorMessages,
        path: req.path,
        method: req.method
      });
      
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации данных',
        errors: errorMessages,
        validationDetails: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }))
      });
    }

    // Сохраняем валидированные данные
    req.validatedData = value;
    
    console.log(`[VALIDATOR MIDDLEWARE] Данные успешно валидированы, переходим к следующему middleware`);
    next();
  };
};

module.exports = {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  productSearchSchema,
  updateStatusSchema,
  updateStockSchema,
  validateProduct, // Экспортируем middleware с логированием
  validateProductWithLogging // Экспортируем функцию для использования в других местах
};