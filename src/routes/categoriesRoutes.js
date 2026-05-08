import { Router } from "express";

const router = Router();

import categoriesController from "../controllers/categoriesController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validateObjectId } from "../middlewares/validation.middleware.js";
import {
  categoryListQuerySchema,
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  validateCategory,
  validateCategoryQuery,
} from "../validators/category.validator.js";

// Публичные эндпоинты (доступны всем)
router.get(
  "/",
  validateCategoryQuery(categoryQuerySchema),
  categoriesController.getAllCategories,
);

router.get(
  "/list",
  validateCategoryQuery(categoryListQuerySchema),
  categoriesController.getCategoryList,
);

router.get("/slug/:slug", categoriesController.getCategoryBySlug);

router.get(
  "/:id",
  validateObjectId("id"),
  categoriesController.getCategoryById,
);

router.get(
  "/:id/products/count",
  validateObjectId("id"),
  categoriesController.getProductCount,
);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware(["admin"]));

router.post(
  "/",
  validateCategory(createCategorySchema),
  categoriesController.createCategory,
);

router.put(
  "/:id",
  validateObjectId("id"),
  validateCategory(updateCategorySchema),
  categoriesController.updateCategory,
);

router.delete(
  "/:id",
  validateObjectId("id"),
  categoriesController.deleteCategory,
);

module.exports = router;
