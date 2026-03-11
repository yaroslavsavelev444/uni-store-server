import express from "express";
import Joi from "joi";
import productController from "../controllers/productsController.js";
import authMiddleware, {
  optionalAuth,
} from "../middlewares/auth-middleware.js";
import validationMiddleware from "../middlewares/validation.middleware.js";
import prodValidator from "../validators/product.validator.js";

const {
  createProductSchema,
  productQuerySchema,
  productSearchSchema,
  updateProductSchema,
  validateProduct,
} = prodValidator;

const { validateObjectId, validateQueryParams } = validationMiddleware;
const router = express.Router();

router.get("/getHints", productController.getHints);

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
  productController.getSimilarProducts,
);

// История поиска
router.post(
  "/saveSearchHistory",
  authMiddleware(["all"]),
  productController.saveSearchHistory,
);
router.get(
  "/getSearchHistory",
  authMiddleware(["all"]),
  productController.getSearchHistory,
);
router.post(
  "/clearSearchHistory",
  authMiddleware(["all"]),
  productController.clearSearchHistory,
);

// Публичные эндпоинты
router.get(
  "/",
  validateQueryParams(productQuerySchema),
  optionalAuth({
    allowedRoles: ["user", "admin"],
    checkBlock: true,
  }),
  productController.getAllProducts,
);

router.get(
  "/search",
  validateQueryParams(productSearchSchema),
  productController.searchProducts,
);

router.get("/statuses", productController.getProductStatuses);

router.get("/:id", validateObjectId("id"), productController.getProductById);

router.get(
  "/sku/:sku",
  optionalAuth("all", true),
  productController.getProductBySku,
);

router.get(
  "/:id/related",
  validateObjectId("id"),
  productController.getRelatedProducts,
);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware(["admin"]));

router.post(
  "/",
  validateProduct(createProductSchema),
  productController.createProduct,
);

router.put(
  "/:id",
  authMiddleware(["admin"]),
  validateObjectId("id"),
  validateProduct(updateProductSchema),
  productController.updateProduct,
);

router.patch(
  "/:id/status",
  authMiddleware(["admin"]),
  validateObjectId("id"),
  // validateProduct(updateStatusSchema), // если есть
  productController.updateProductStatus,
);

router.post(
  "/:id/related",
  authMiddleware(["admin"]),
  validateObjectId("id"),
  validateProduct(
    Joi.object({
      relatedProductId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    }),
  ),
  productController.addRelatedProduct,
);

export default router;
