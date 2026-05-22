const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoriesController');
const authMiddleware = require('../middlewares/auth-middleware');
const {
  validateCategory,
  validateCategoryQuery,
  createCategorySchema,
  updateCategorySchema,
  categoryQuerySchema,
  categoryListQuerySchema
} = require('../validators/category.validator');
const {
  validateObjectId
} = require('../middlewares/validation.middleware');

// Публичные эндпоинты (доступны всем)
router.get(
  '/',
  validateCategoryQuery(categoryQuerySchema),
  categoryController.getAllCategories
);

router.get(
  '/list',
  validateCategoryQuery(categoryListQuerySchema),
  categoryController.getCategoryList
);

router.get(
  '/slug/:slug',
  categoryController.getCategoryBySlug
);

router.get(
  '/:id',
  validateObjectId('id'),
  categoryController.getCategoryById
);

router.get(
  '/:id/products/count',
  validateObjectId('id'),
  categoryController.getProductCount
);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware(['admin']));

router.post(
  '/',
  validateCategory(createCategorySchema),
  categoryController.createCategory
);

router.put(
  '/:id',
  validateObjectId('id'),
  validateCategory(updateCategorySchema),
  categoryController.updateCategory
);

router.delete(
  '/:id',
  validateObjectId('id'),
  categoryController.deleteCategory
);

module.exports = router;