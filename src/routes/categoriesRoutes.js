import { Router } from "express";

const router = Router();

import categoriesController from "../controllers/categoriesController.js";

const {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryList,
  getProductCount,
  updateCategory,
} = categoriesController;

import authMiddleware from "../middlewares/auth-middleware.js";
import validationMiddleware from "../middlewares/validation.middleware.js";

const { validateObjectId } = validationMiddleware;

import categoryValidator from "../validators/category.validator.js";

const {
  categoryListQuerySchema,
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  validateCategory,
  validateCategoryQuery,
} = categoryValidator;

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
