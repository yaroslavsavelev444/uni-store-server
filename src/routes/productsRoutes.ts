import express from "express";
import Joi from "joi";
import productController from "../controllers/productsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import {
  validateObjectId,
  validateQueryParams,
} from "../middlewares/validators.js";
import {
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
  validateProduct,
} from "../validators/product.validator.js";

const router = express.Router();

router.get(
  "/:id/similar",
  validateObjectId("id"),
  validateQueryParams(
    Joi.object({
      limit: Joi.number().integer().min(1).max(20).default(4),
      strategy: Joi.string()
        .valid("category", "price", "mixed")
        .default("mixed"),
    }),
  ),
  productController.getSimilarProducts as any,
);

// Публичные эндпоинты
router.get(
  "/",
  validateQueryParams(productQuerySchema),
  authMiddleware.optional(["all"]),
  productController.getAllProducts as any,
);

router.get("/statuses", productController.getProductStatuses);

router.get(
  "/:id",
  validateObjectId("id"),
  productController.getProductById as any,
);

router.get(
  "/sku/:sku",
  authMiddleware.optionalAuth(),
  productController.getProductBySku as any,
);

router.get(
  "/:id/related",
  validateObjectId("id"),
  productController.getRelatedProducts as any,
);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware(["admin"])); // ИЗМЕНЕНО: middleware авторизации

router.post(
  "/",
  validateProduct(createProductSchema),
  productController.createProduct as any,
);
router.put(
  "/:id",
  authMiddleware(["admin"]),
  validateObjectId("id"),
  validateProduct(updateProductSchema), // Этот middleware теперь будет логировать всё
  productController.updateProduct as any,
);

router.patch(
  "/:id/status",
  authMiddleware(["admin"]), // ДОБАВИТЬ
  validateObjectId("id"),
  // validateProduct(updateStatusSchema), // ДОБАВИТЬ: валидация данных
  productController.updateProductStatus as any,
);

router.post(
  "/:id/related",
  authMiddleware(["admin"]), // ДОБАВИТЬ
  validateObjectId("id"),
  validateProduct(
    Joi.object({
      relatedProductId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  ), // ДОБАВИТЬ
  productController.addRelatedProduct as any,
);

export default router;
