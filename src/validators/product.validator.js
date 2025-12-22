const Joi = require('joi');
const { ProductStatus } = require('../models/product-model');

// Вспомогательные схемы для валидации файлов
const imageSchema = Joi.object({
  url: Joi.string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/images\/|https?:\/\/)/) // ИЗМЕНЕНО: более гибкий паттерн
    .message('Некорректный формат изображения'),
  alt: Joi.string().max(255).optional().allow('', null).default(''),
  order: Joi.number().integer().min(0).optional().default(0)
});

const instructionFileSchema = Joi.object({
  url: Joi.string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/instructions\/|https?:\/\/)/) // ИЗМЕНЕНО
    .message('Некорректный формат инструкции'),
  originalName: Joi.string().max(255).required(),
  size: Joi.number().integer().positive().max(50 * 1024 * 1024).required()
}).optional().allow(null); // ДОБАВИТЬ: allow null


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
    .max(1000000), // ДОБАВЛЕНО: максимальная цена
  
  priceForLegalEntity: Joi.number()
    .positive()
    .precision(2)
    .max(1000000)
    .when('isLegalEntityPriceEnabled', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
  
  isLegalEntityPriceEnabled: Joi.boolean()
    .default(false),
  
  stockQuantity: Joi.number()
    .required()
    .integer()
    .min(0)
    .max(100000), // ДОБАВЛЕНО: максимальное количество
  
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
    .allow('', null), // ДОБАВИТЬ: allow null
    
  images: Joi.array()
    .items(imageSchema)
    .max(20)
    .optional()
    .default([]), // ДОБАВИТЬ: default пустой массив
    
  instructionFile: Joi.alternatives()
    .try(
      instructionFileSchema,
      Joi.string().allow('', null),
      Joi.object().allow(null)
    )
    .optional()
    .default(null), // ДОБАВИТЬ: default null
    

  
  specifications: Joi.array()
    .items(Joi.object({
      name: Joi.string().required().max(100),
      value: Joi.any().required(),
      unit: Joi.string().max(20).optional(),
      group: Joi.string().max(50).optional(),
      isVisible: Joi.boolean().default(true)
    }))
    .max(50) // ДОБАВЛЕНО: лимит характеристик
    .optional()
        .default([]), // ДОБАВИТЬ

  customAttributes: Joi.object()
    .pattern(/^[a-zA-Z0-9_]+$/, Joi.any()) // ДОБАВЛЕНО: валидация ключей
    .max(20) // ДОБАВЛЕНО: лимит кастомных атрибутов
    .optional(),
  
  relatedProducts: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .unique() // ДОБАВЛЕНО: уникальные ID
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
    .max(100000) // в граммах
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
  
  discount: Joi.object({
    isActive: Joi.boolean().default(false),
    percentage: Joi.number().min(0).max(100).optional(),
    amount: Joi.number().positive().max(Joi.ref('priceForIndividual')).optional(),
    validFrom: Joi.date().iso().optional(),
    validUntil: Joi.date().iso().greater(Joi.ref('validFrom')).optional(),
    minQuantity: Joi.number().integer().min(1).optional().default(1)
  })
  .optional()
  .allow(null), // ДОБАВИТЬ: allow null

  
  isVisible: Joi.boolean()
    .default(true),
  
  isFeatured: Joi.boolean()
    .default(false),
  
  showOnMainPage: Joi.boolean()
    .default(false),
  
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
.with('maxOrderQuantity', 'minOrderQuantity') // ДОБАВЛЕНО: зависимость полей
.with('priceForLegalEntity', 'isLegalEntityPriceEnabled');

const updateProductSchema = createProductSchema.fork(
  // Сделать все поля опциональными
  Object.keys(createProductSchema.describe().keys),
  (schema) => schema.optional()
).min(1); // Но минимум одно поле должно быть


const productQuerySchema = Joi.object({
  category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  status: Joi.string().valid(...Object.values(ProductStatus)),
  minPrice: Joi.number().positive().max(1000000),
  maxPrice: Joi.number().positive().max(1000000).min(Joi.ref('minPrice')),
  inStock: Joi.boolean(),
  featured: Joi.boolean(),
  search: Joi.string().max(100),
  sortBy: Joi.string().valid('price', 'title', 'createdAt', 'updatedAt', 'popularity', 'stockQuantity'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  populate: Joi.string().valid('category', 'relatedProducts', 'all', 'none').default('none')
})
.with('maxPrice', 'minPrice'); // ДОБАВЛЕНО: валидация диапазона цен

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
  operation: Joi.string().valid('set', 'add', 'subtract').default('set'), // ИЗМЕНЕНО: добавлен 'set'
  reason: Joi.string().max(500).optional()
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  productSearchSchema,
  updateStatusSchema,
  updateStockSchema
};