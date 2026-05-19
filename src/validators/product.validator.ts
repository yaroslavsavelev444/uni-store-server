// validators/product.validator.ts

import type { NextFunction, Request, Response } from "express";
import Joi from "joi";
import type { ProductStatusType } from "../types/product.types.js";
import { ProductStatus } from "../types/product.types.js";

// Расширяем интерфейс Request для добавления validatedData
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
    }
  }
}

// Вспомогательные схемы
const imageSchema = Joi.object({
  url: Joi.string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/images\/|https?:\/\/)/)
    .message("Некорректный формат изображения"),
  alt: Joi.string().max(255).optional().allow("", null).default(""),
  order: Joi.number().integer().min(0).optional().default(0),
});

const instructionFileSchema = Joi.object({
  type: Joi.string().valid("file").required(),
  url: Joi.string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/instructions\/|https?:\/\/)/)
    .message("Некорректный формат файла инструкции"),
  originalName: Joi.string().max(255).required(),
  size: Joi.number()
    .integer()
    .positive()
    .max(50 * 1024 * 1024)
    .required(),
  alt: Joi.string().max(255).optional().allow("", null),
  mimetype: Joi.string().optional(),
});

const instructionLinkSchema = Joi.object({
  type: Joi.string().valid("link").required(),
  url: Joi.string().required().uri().message("Некорректный формат ссылки"),
  title: Joi.string().max(255).optional().allow("", null).default("Инструкция"),
});

const instructionSchema = Joi.alternatives()
  .try(instructionFileSchema, instructionLinkSchema)
  .optional()
  .allow(null)
  .default(null);

const productStatusValues = Object.values(ProductStatus) as ProductStatusType[];

export const createProductSchema = Joi.object({
  sku: Joi.string()
    .required()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      "string.pattern.base":
        "SKU может содержать только буквы, цифры, дефисы и подчеркивания",
    }),

  title: Joi.string().required().min(3).max(200).trim(),

  description: Joi.string().required().min(10).max(5000),

  priceForIndividual: Joi.number()
    .required()
    .positive()
    .precision(2)
    .max(100000000),

  status: Joi.string()
    .valid(...productStatusValues)
    .default(ProductStatus.AVAILABLE),

  category: Joi.string()
    .required()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .message("Некорректный ID категории"),

  mainImage: Joi.string()
    .uri()
    .pattern(/^(\/uploads\/products\/images\/|https?:\/\/)/)
    .message("Некорректный формат основного изображения")
    .optional()
    .allow("", null),

  showOnMainPage: Joi.boolean().default(false),

  images: Joi.array().items(imageSchema).max(20).optional().default([]),

  instruction: instructionSchema,

  specifications: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required().max(100),
        value: Joi.any().required(),
        unit: Joi.string().max(20).optional(),
        group: Joi.string().max(50).optional(),
        isVisible: Joi.boolean().default(true),
      }),
    )
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

  weight: Joi.number().positive().max(100000).optional(),

  dimensions: Joi.object({
    length: Joi.number().positive().max(10000).optional(),
    width: Joi.number().positive().max(10000).optional(),
    height: Joi.number().positive().max(10000).optional(),
  }).optional(),

  manufacturer: Joi.string().max(100).optional().allow("").default(""),

  warrantyMonths: Joi.number().integer().min(0).max(120).optional(),

  minOrderQuantity: Joi.number().integer().min(1).max(1000).default(1),

  maxOrderQuantity: Joi.number()
    .integer()
    .min(Joi.ref("minOrderQuantity"))
    .max(10000)
    .optional(),

  isVisible: Joi.boolean().default(true),

  metaTitle: Joi.string().max(255).optional().allow(""),

  metaDescription: Joi.string().max(500).optional().allow(""),

  keywords: Joi.array().items(Joi.string().max(50)).max(20).optional(),
}).with("maxOrderQuantity", "minOrderQuantity");

export const updateProductSchema = createProductSchema
  .fork(Object.keys(createProductSchema.describe().keys), (schema) =>
    schema.optional(),
  )
  .min(1);

export const productQuerySchema = Joi.object({
  category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  status: Joi.string().valid(...productStatusValues),
  minPrice: Joi.number().positive().max(1000000),
  maxPrice: Joi.number().positive().max(1000000).min(Joi.ref("minPrice")),
  inStock: Joi.boolean(),
  isAdmin: Joi.boolean(),
  slug: Joi.string().max(100),
  search: Joi.string().max(100),
  sortBy: Joi.string().valid(
    "price",
    "title",
    "createdAt",
    "updatedAt",
    "popularity",
  ),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  showOnMainPage: Joi.boolean().default(false),
  populate: Joi.string()
    .valid("category", "relatedProducts", "all", "none")
    .default("none"),
  excludeIds: Joi.alternatives().try(
    Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
    Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)),
  ),
}).with("maxPrice", "minPrice");

export const productSearchSchema = Joi.object({
  q: Joi.string().min(1).max(100).required(),
  category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  limit: Joi.number().integer().min(1).max(50).default(10),
  page: Joi.number().integer().min(1).default(1),
});

export const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...productStatusValues)
    .required(),
});

export const updateStockSchema = Joi.object({
  quantity: Joi.number().integer().required(),
  operation: Joi.string().valid("set", "add", "subtract").default("set"),
  reason: Joi.string().max(500).optional(),
});

// Тип для результата валидации
interface ValidationResult<T = any> {
  error: Joi.ValidationError | null;
  value: T;
}

// Функция валидации с логированием
export function validateProductWithLogging<T = any>(
  schema: Joi.ObjectSchema<T>,
  data: unknown,
  context = "",
): ValidationResult<T> {
  console.log(`[VALIDATOR${context ? ` ${context}` : ""}] Валидация данных:`, {
    timestamp: new Date().toISOString(),
    dataType: typeof data,
    isArray: Array.isArray(data),
    keys: Object.keys((data as any) || {}),
    hasImages: !!(data as any)?.images,
    imagesCount: Array.isArray((data as any)?.images)
      ? (data as any).images.length
      : 0,
    hasMainImage: !!(data as any)?.mainImage,
    imageUrls: Array.isArray((data as any)?.images)
      ? (data as any).images.map((img: any) => ({
          url: img.url ? `${img.url.substring(0, 50)}...` : "нет",
          alt: img.alt || "нет",
        }))
      : "нет изображений",
  });

  console.log(
    `[VALIDATOR${context ? ` ${context}` : ""}] Полные данные:`,
    JSON.stringify(
      {
        sku: (data as any)?.sku,
        title: (data as any)?.title,
        images: (data as any)?.images,
        mainImage: (data as any)?.mainImage,
        specifications: (data as any)?.specifications
          ? `[массив из ${(data as any).specifications.length} элементов]`
          : "нет",
      },
      null,
      2,
    ),
  );

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  });

  if (error) {
    console.error(
      `[VALIDATOR${context ? ` ${context}` : ""}] Ошибки валидации:`,
      {
        timestamp: new Date().toISOString(),
        totalErrors: error.details.length,
        errors: error.details.map((detail) => ({
          path: detail.path.join("."),
          message: detail.message,
          type: detail.type,
          context: detail.context,
        })),
        originalData: data,
      },
    );

    error.details.forEach((detail, index) => {
      console.error(
        `[VALIDATOR${context ? ` ${context}` : ""}] Ошибка ${index + 1}:`,
        {
          field: detail.path.join("."),
          value: detail.context ? detail.context.value : "не указано",
          problem: detail.message,
          validationType: detail.type,
        },
      );
    });
  } else {
    console.log(
      `[VALIDATOR${context ? ` ${context}` : ""}] Валидация успешна:`,
      {
        timestamp: new Date().toISOString(),
        validFields: Object.keys(value).length,
        hasImages: !!value.images,
        imagesCount: Array.isArray(value.images) ? value.images.length : 0,
      },
    );
  }

  return { error, value };
}

// Middleware для валидации с логированием
export const validateProduct = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    console.log(`[VALIDATOR MIDDLEWARE] Запрос ${req.method} ${req.path}`);
    console.log(
      `[VALIDATOR MIDDLEWARE] Content-Type: ${req.headers["content-type"]}`,
    );
    console.log(`[VALIDATOR MIDDLEWARE] Headers:`, {
      "content-type": req.headers["content-type"],
      "content-length": req.headers["content-length"],
    });

    const data = { ...req.body, ...req.query, ...req.params };

    console.log(`[VALIDATOR MIDDLEWARE] Тип запроса: ${req.method}`);
    console.log(`[VALIDATOR MIDDLEWARE] Источник данных:`, {
      body: Object.keys(req.body || {}),
      query: Object.keys(req.query || {}),
      params: Object.keys(req.params || {}),
    });

    if ((req.body as any)?.images) {
      console.log(`[VALIDATOR MIDDLEWARE] Изображения в запросе:`, {
        count: (req.body as any).images.length,
        firstImage: (req.body as any).images[0]
          ? {
              url: (req.body as any).images[0].url
                ? `${(req.body as any).images[0].url.substring(0, 100)}...`
                : "нет URL",
              alt: (req.body as any).images[0].alt || "нет alt",
              _shouldDelete: (req.body as any).images[0]._shouldDelete || false,
            }
          : "нет изображений",
        allImages: (req.body as any).images.map((img: any, idx: number) => ({
          index: idx,
          url: img.url ? `${img.url.substring(0, 50)}...` : "нет URL",
          shouldDelete: img._shouldDelete || false,
        })),
      });
    }

    if ((req.body as any)?.specifications) {
      console.log(`[VALIDATOR MIDDLEWARE] Спецификации в запросе:`, {
        count: (req.body as any).specifications.length,
        firstSpec: (req.body as any).specifications[0] || "нет",
      });
    }

    const { error, value } = validateProductWithLogging(
      schema,
      data,
      `${req.method} ${req.path}`,
    );

    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      console.error(`[VALIDATOR MIDDLEWARE] Возвращаем ошибку клиенту:`, {
        status: 400,
        errors: errorMessages,
        path: req.path,
        method: req.method,
      });
      res.status(400).json({
        success: false,
        message: "Ошибка валидации данных",
        errors: errorMessages,
        validationDetails: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          type: detail.type,
        })),
      });
      return;
    }

    req.validatedData = value;
    console.log(
      `[VALIDATOR MIDDLEWARE] Данные успешно валидированы, переходим к следующему middleware`,
    );
    next();
  };
};

export default {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  productSearchSchema,
  updateStatusSchema,
  updateStockSchema,
  validateProduct,
  validateProductWithLogging,
};
