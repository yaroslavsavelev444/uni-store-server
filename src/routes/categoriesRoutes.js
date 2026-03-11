import { Router } from "express";

const router = Router();

import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryList,
  getProductCount,
  updateCategory,
} from "../controllers/categoriesController";
import authMiddleware from "../middlewares/auth-middleware";
import { validateObjectId } from "../middlewares/validation.middleware";
import {
  categoryListQuerySchema,
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  validateCategory,
  validateCategoryQuery,
} from "../validators/category.validator";

// Публичные эндпоинты (доступны всем)
router.get("/", validateCategoryQuery(categoryQuerySchema), getAllCategories);

router.get(
  "/list",
  validateCategoryQuery(categoryListQuerySchema),
  getCategoryList,
);

router.get("/slug/:slug", getCategoryBySlug);

router.get("/:id", validateObjectId("id"), getCategoryById);

router.get("/:id/products/count", validateObjectId("id"), getProductCount);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware(["admin"]));

router.post("/", validateCategory(createCategorySchema), createCategory);

router.put(
  "/:id",
  validateObjectId("id"),
  validateCategory(updateCategorySchema),
  updateCategory,
);

router.delete("/:id", validateObjectId("id"), deleteCategory);

export default router;
