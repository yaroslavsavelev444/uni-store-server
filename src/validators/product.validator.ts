// validators/product.validator.ts

import type { NextFunction, Request, Response } from "express";
import Joi from "joi";
import type { ProductStatusType } from "../types/product.types.js";
import { ProductStatus } from "../types/product.types.js";

// Вспомогательная функция для безопасного доступа к полям unknown объекта
function getValue(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
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
  link: Joi.string().required().uri().message("Некорректный формат ссылки"),
});

const instructionSchema = Joi.alternatives()
  .try(
    instructionFileSchema,
    instructionLinkSchema,
    Joi.object().length(0), // пустой объект
    Joi.valid(null, {}),
  )
  .optional()
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

  images: Joi.array().items(Joi.string()).max(20).optional().default([]),
  removedImageIds: Joi.array().items(Joi.string()).optional().default([]),
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
interface ValidationResult<T = unknown> {
  error: Joi.ValidationError | null;
  value: T;
}

// Функция валидации с логированием
export function validateProductWithLogging<T = unknown>(
  schema: Joi.ObjectSchema<T>,
  data: unknown,
  context = "",
): ValidationResult<T> {
  console.log(`[VALIDATOR${context ? ` ${context}` : ""}] Валидация данных:`, {
    timestamp: new Date().toISOString(),
    dataType: typeof data,
    isArray: Array.isArray(data),
    keys: Object.keys((data as Record<string, unknown>) || {}),
    hasImages: !!getValue(data, "images"),
    imagesCount: Array.isArray(getValue(data, "images"))
      ? (getValue(data, "images") as unknown[]).length
      : 0,
    hasMainImage: !!getValue(data, "mainImage"),
    imageUrls: Array.isArray(getValue(data, "images"))
      ? (getValue(data, "images") as unknown[]).map((img) => {
          const imgRecord = img as Record<string, unknown>;
          return {
            url: imgRecord.url
              ? `${String(imgRecord.url).substring(0, 50)}...`
              : "нет",
            alt: imgRecord.alt || "нет",
          };
        })
      : "нет изображений",
  });

  console.log(
    `[VALIDATOR${context ? ` ${context}` : ""}] Полные данные:`,
    JSON.stringify(
      {
        sku: getValue(data, "sku"),
        title: getValue(data, "title"),
        images: getValue(data, "images"),
        mainImage: getValue(data, "mainImage"),
        specifications: getValue(data, "specifications")
          ? `[массив из ${(getValue(data, "specifications") as unknown[]).length} элементов]`
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
    );
  }

  return { error: error ? error : null, value };
}

// Middleware для валидации с логированием
export const validateProduct = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const data = { ...req.body, ...req.query, ...req.params };
    // === ЗАЩИТА ОТ ПУСТОГО instruction ===
    if (
      data.instruction &&
      typeof data.instruction === "object" &&
      Object.keys(data.instruction).length === 0
    ) {
      delete data.instruction; // считаем, что поле не меняется
    }

    const { error, value } = validateProductWithLogging(
      schema,
      data,
      `${req.method} ${req.path}`,
    );

    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
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
