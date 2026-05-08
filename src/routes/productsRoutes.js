import { Router } from "express";

const router = Router();

import productController from "../controllers/productsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import _default from "../middlewares/validation.middleware.js";
import {
	createProductSchema,
	productQuerySchema,
	updateProductSchema,
} from "../validators/product.validator.js";

const { validateObjectId, validateQueryParams } = _default;

import { number, object, string } from "joi";
import __default from "../validators/product.validator.js";

const { validateProduct } = __default; // или где у вас лежит файл

router.get(
	"/:id/similar",
	validateObjectId("id"),
	validateQueryParams(
		object({
			limit: number().integer().min(1).max(20).default(4),
			strategy: string().valid("category", "price", "mixed").default("mixed"),
		}),
	),
	productController.getSimilarProducts,
);

// Публичные эндпоинты
router.get(
	"/",
	validateQueryParams(productQuerySchema),
	authMiddleware.optionalAuth({
		allowedRoles: ["user", "admin"],
		checkBlock: true,
	}),
	productController.getAllProducts,
);

router.get("/statuses", productController.getProductStatuses);

router.get("/:id", validateObjectId("id"), productController.getProductById);

router.get(
	"/sku/:sku",
	authMiddleware.optionalAuth("all", true),
	productController.getProductBySku,
);

router.get("/:id/related", validateObjectId("id"), productController.getRelatedProducts);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware(["admin"])); // ИЗМЕНЕНО: middleware авторизации

router.post("/", validateProduct(createProductSchema), productController.createProduct);
router.put(
	"/:id",
	authMiddleware(["admin"]),
	validateObjectId("id"),
	validateProduct(updateProductSchema), // Этот middleware теперь будет логировать всё
	productController.updateProduct,
);

router.patch(
	"/:id/status",
	authMiddleware(["admin"]), // ДОБАВИТЬ
	validateObjectId("id"),
	// validateProduct(updateStatusSchema), // ДОБАВИТЬ: валидация данных
	productController.updateProductStatus,
);

router.post(
	"/:id/related",
	authMiddleware(["admin"]), // ДОБАВИТЬ
	validateObjectId("id"),
	validateProduct(
		object({
			relatedProductId: string()
				.pattern(/^[0-9a-fA-F]{24}$/)
				.required(),
		}),
	), // ДОБАВИТЬ
	productController.addRelatedProduct,
);

export default router;
