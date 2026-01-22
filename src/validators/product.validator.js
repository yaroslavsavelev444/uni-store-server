const Joi = require('joi');
const { ProductStatus } = require('../models/product-model');

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
  
  stockQuantity: Joi.number()
    .required()
    .integer()
    .min(0)
    .max(100000),
  
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
.with('maxOrderQuantity', 'minOrderQuantity')

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
  sortBy: Joi.string().valid('price', 'title', 'createdAt', 'updatedAt', 'popularity', 'stockQuantity'),
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

module.exports = {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  productSearchSchema,
  updateStatusSchema,
  updateStockSchema
};