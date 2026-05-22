import { Router } from "express";

const router = Router();

import categoriesController from "../controllers/categoriesController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validateObjectId } from "../middlewares/validators.js";
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
  categoriesController.getAllCategories as any,
);

router.get(
  "/list",
  validateCategoryQuery(categoryListQuerySchema),
  categoriesController.getCategoryList as any,
);

router.get("/slug/:slug", categoriesController.getCategoryBySlug as any);

router.get(
  "/:id",
  validateObjectId("id"),
  categoriesController.getCategoryById as any,
);

router.get(
  "/:id/products/count",
  validateObjectId("id"),
  categoriesController.getProductCount as any,
);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware.requireRole("admin"));

router.post(
  "/",
  validateCategory(createCategorySchema),
  categoriesController.createCategory as any,
);

router.put(
  "/:id",
  validateObjectId("id"),
  validateCategory(updateCategorySchema),
  categoriesController.updateCategory as any,
);

router.delete(
  "/:id",
  validateObjectId("id"),
  categoriesController.deleteCategory as any,
);

export default router;
