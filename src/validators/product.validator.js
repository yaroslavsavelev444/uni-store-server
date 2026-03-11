import joi from "joi";

import { ProductStatus } from "../models/product-model.js";

console.log("[VALIDATOR] Загрузка схем валидации продуктов...");

// Вспомогательные схемы для валидации файлов
const imageSchema = joi.object({
  url: joi
    .string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/images\/|https?:\/\/)/)
    .message("Некорректный формат изображения"),
  alt: joi.string().max(255).optional().allow("", null).default(""),
  order: joi.number().integer().min(0).optional().default(0),
});

// Схема для инструкции-файла
const instructionFileSchema = joi.object({
  type: joi.string().valid("file").required(),
  url: joi
    .string()
    .required()
    .uri()
    .pattern(/^(\/uploads\/products\/instructions\/|https?:\/\/)/)
    .message("Некорректный формат файла инструкции"),
  originalName: joi.string().max(255).required(),
  size: joi
    .number()
    .integer()
    .positive()
    .max(50 * 1024 * 1024)
    .required(),
  alt: joi.string().max(255).optional().allow("", null),
  mimetype: joi.string().optional(),
});

// Схема для инструкции-ссылки
const instructionLinkSchema = joi.object({
  type: joi.string().valid("link").required(),
  url: joi.string().required().uri().message("Некорректный формат ссылки"),
  title: joi.string().max(255).optional().allow("", null).default("Инструкция"),
});

// Общая схема для инструкции (либо файл, либо ссылка)
const instructionSchema = joi
  .alternatives()
  .try(instructionFileSchema, instructionLinkSchema)
  .optional()
  .allow(null)
  .default(null);

const createProductSchema = joi
  .object({
    sku: joi
      .string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        "string.pattern.base":
          "SKU может содержать только буквы, цифры, дефисы и подчеркивания",
      }),

    title: joi.string().required().min(3).max(200).trim(),

    description: joi.string().required().min(10).max(5000),

    priceForIndividual: joi
      .number()
      .required()
      .positive()
      .precision(2)
      .max(100000000),

    status: joi
      .string()
      .valid(...Object.values(ProductStatus))
      .default(ProductStatus.AVAILABLE),

    category: joi
      .string()
      .required()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .message("Некорректный ID категории"),

    mainImage: joi
      .string()
      .uri()
      .pattern(/^(\/uploads\/products\/images\/|https?:\/\/)/)
      .message("Некорректный формат основного изображения")
      .optional()
      .allow("", null),

    showOnMainPage: joi.boolean().default(false),

    images: joi.array().items(imageSchema).max(20).optional().default([]),

    instruction: instructionSchema,

    specifications: joi
      .array()
      .items(
        joi.object({
          name: joi.string().required().max(100),
          value: joi.any().required(),
          unit: joi.string().max(20).optional(),
          group: joi.string().max(50).optional(),
          isVisible: joi.boolean().default(true),
        }),
      )
      .max(50)
      .optional()
      .default([]),

    customAttributes: joi
      .object()
      .pattern(/^[a-zA-Z0-9_]+$/, joi.any())
      .max(20)
      .optional(),

    relatedProducts: joi
      .array()
      .items(joi.string().pattern(/^[0-9a-fA-F]{24}$/))
      .unique()
      .max(20)
      .optional(),

    upsellProducts: joi
      .array()
      .items(joi.string().pattern(/^[0-9a-fA-F]{24}$/))
      .unique()
      .max(10)
      .optional(),

    crossSellProducts: joi
      .array()
      .items(joi.string().pattern(/^[0-9a-fA-F]{24}$/))
      .unique()
      .max(10)
      .optional(),

    weight: joi.number().positive().max(100000).optional(),

    dimensions: joi
      .object({
        length: joi.number().positive().max(10000).optional(),
        width: joi.number().positive().max(10000).optional(),
        height: joi.number().positive().max(10000).optional(),
      })
      .optional(),

    manufacturer: joi.string().max(100).optional().allow("").default(""),

    warrantyMonths: joi.number().integer().min(0).max(120).optional(),

    minOrderQuantity: joi.number().integer().min(1).max(1000).default(1),

    maxOrderQuantity: joi
      .number()
      .integer()
      .min(joi.ref("minOrderQuantity"))
      .max(10000)
      .optional(),

    isVisible: joi.boolean().default(true),

    metaTitle: joi.string().max(255).optional().allow(""),

    metaDescription: joi.string().max(500).optional().allow(""),

    keywords: joi.array().items(joi.string().max(50)).max(20).optional(),
  })
  .with("maxOrderQuantity", "minOrderQuantity");

const updateProductSchema = createProductSchema
  .fork(Object.keys(createProductSchema.describe().keys), (schema) =>
    schema.optional(),
  )
  .min(1);

const productQuerySchema = joi
  .object({
    category: joi.string().pattern(/^[0-9a-fA-F]{24}$/),
    status: joi.string().valid(...Object.values(ProductStatus)),
    minPrice: joi.number().positive().max(1000000),
    maxPrice: joi.number().positive().max(1000000).min(joi.ref("minPrice")),
    inStock: joi.boolean(),
    isAdmin: joi.boolean(),
    slug: joi.string().max(100),
    search: joi.string().max(100),
    sortBy: joi
      .string()
      .valid("price", "title", "createdAt", "updatedAt", "popularity"),
    sortOrder: joi.string().valid("asc", "desc").default("desc"),
    page: joi.number().integer().min(1).default(1),
    limit: joi.number().integer().min(1).max(100).default(50),
    showOnMainPage: joi.boolean().default(false),
    populate: joi
      .string()
      .valid("category", "relatedProducts", "all", "none")
      .default("none"),
    excludeIds: joi
      .alternatives()
      .try(
        joi.string().pattern(/^[0-9a-fA-F]{24}$/),
        joi.array().items(joi.string().pattern(/^[0-9a-fA-F]{24}$/)),
      ),
  })
  .with("maxPrice", "minPrice");

const productSearchSchema = joi.object({
  q: joi.string().min(1).max(100).required(),
  category: joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  limit: joi.number().integer().min(1).max(50).default(10),
  page: joi.number().integer().min(1).default(1),
});

const updateStatusSchema = joi.object({
  status: joi
    .string()
    .valid(...Object.values(ProductStatus))
    .required(),
});

const updateStockSchema = joi.object({
  quantity: joi.number().integer().required(),
  operation: joi.string().valid("set", "add", "subtract").default("set"),
  reason: joi.string().max(500).optional(),
});

// Функция для логирования данных и ошибок валидации
const validateProductWithLogging = (schema, data, context = "") => {
  console.log(`[VALIDATOR${context ? ` ${context}` : ""}] Валидация данных:`, {
    timestamp: new Date().toISOString(),
    dataType: typeof data,
    isArray: Array.isArray(data),
    keys: Object.keys(data || {}),
    // Логируем важные поля для отладки проблем с изображениями
    hasImages: !!data?.images,
    imagesCount: Array.isArray(data?.images) ? data.images.length : 0,
    hasMainImage: !!data?.mainImage,
    imageUrls: Array.isArray(data?.images)
      ? data.images.map((img) => ({
          url: img.url ? `${img.url.substring(0, 50)}...` : "нет",
          alt: img.alt || "нет",
        }))
      : "нет изображений",
  });

  // Логируем полные данные (можно ограничить для безопасности)
  console.log(
    `[VALIDATOR${context ? ` ${context}` : ""}] Полные данные:`,
    JSON.stringify(
      {
        sku: data.sku,
        title: data.title,
        images: data.images,
        mainImage: data.mainImage,
        // Не логируем все поля для безопасности, только проблемные
        specifications: data.specifications
          ? `[массив из ${data.specifications.length} элементов]`
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

    // Логируем подробную информацию об ошибках
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
};

// Middleware для валидации с логированием
const validateProduct = (schema) => {
  return (req, res, next) => {
    console.log(`[VALIDATOR MIDDLEWARE] Запрос ${req.method} ${req.path}`);
    console.log(
      `[VALIDATOR MIDDLEWARE] Content-Type: ${req.headers["content-type"]}`,
    );

    // Логируем заголовки для отладки
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

    // Логируем специальные поля для отладки проблем
    if (req.body.images) {
      console.log(`[VALIDATOR MIDDLEWARE] Изображения в запросе:`, {
        count: req.body.images.length,
        firstImage: req.body.images[0]
          ? {
              url: req.body.images[0].url
                ? `${req.body.images[0].url.substring(0, 100)}...`
                : "нет URL",
              alt: req.body.images[0].alt || "нет alt",
              _shouldDelete: req.body.images[0]._shouldDelete || false,
            }
          : "нет изображений",
        allImages: req.body.images.map((img, idx) => ({
          index: idx,
          url: img.url ? `${img.url.substring(0, 50)}...` : "нет URL",
          shouldDelete: img._shouldDelete || false,
        })),
      });
    }

    if (req.body.specifications) {
      console.log(`[VALIDATOR MIDDLEWARE] Спецификации в запросе:`, {
        count: req.body.specifications.length,
        firstSpec: req.body.specifications[0] || "нет",
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

      return res.status(400).json({
        success: false,
        message: "Ошибка валидации данных",
        errors: errorMessages,
        validationDetails: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          type: detail.type,
        })),
      });
    }

    // Сохраняем валидированные данные
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
  validateProduct, // Экспортируем middleware с логированием
  validateProductWithLogging, // Экспортируем функцию для использования в других местах
};
