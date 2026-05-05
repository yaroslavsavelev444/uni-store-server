const express = require('express');
const router = express.Router();
const productController = require('../controllers/productsController');
const authMiddleware = require('../middlewares/auth-middleware');
const {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  productSearchSchema, 
} = require('../validators/product.validator');
const {
  validateObjectId,
  validateQueryParams,
} = require('../middlewares/validation.middleware');
const Joi = require('joi');
const { validateProduct } = require('../validators/product.validator'); // или где у вас лежит файл


router.get('/getHints', productController.getHints);

router.get(
  '/:id/similar',
  validateObjectId('id'),
  validateQueryParams(Joi.object({
    limit: Joi.number().integer().min(1).max(20).default(4),
    strategy: Joi.string().valid('category', 'price', 'mixed').default('mixed')
  })),
  productController.getSimilarProducts
);

//История поиска 
router.post('/saveSearchHistory', authMiddleware(['all']), productController.saveSearchHistory);
router.get('/getSearchHistory', authMiddleware(['all']), productController.getSearchHistory);
router.post('/clearSearchHistory', authMiddleware(['all']), productController.clearSearchHistory);
// Публичные эндпоинты
router.get(
  '/',
  validateQueryParams(productQuerySchema),
  authMiddleware.optionalAuth({
    allowedRoles: ['user', 'admin'],
    checkBlock: true
  }),
  productController.getAllProducts
);

router.get(
  '/search',
  validateQueryParams(productSearchSchema), // ДОБАВЛЕНО: валидация query params
  productController.searchProducts
);

router.get(
  '/statuses',
  productController.getProductStatuses
);

router.get(
  '/:id',
  validateObjectId('id'),
  productController.getProductById
);

router.get(
  '/sku/:sku',
  authMiddleware.optionalAuth('all', true),
  productController.getProductBySku
);

router.get(
  '/:id/related',
  validateObjectId('id'),
  productController.getRelatedProducts
);

// Защищенные эндпоинты (только для администраторов)
router.use(authMiddleware(['admin'])); // ИЗМЕНЕНО: middleware авторизации

router.post(
  '/',
  validateProduct(createProductSchema),
  productController.createProduct
);
router.put(
  '/:id',
  authMiddleware(['admin']),
  validateObjectId('id'),
  validateProduct(updateProductSchema), // Этот middleware теперь будет логировать всё
  productController.updateProduct
);


router.patch(
  '/:id/status',
  authMiddleware(['admin']), // ДОБАВИТЬ
  validateObjectId('id'),
  // validateProduct(updateStatusSchema), // ДОБАВИТЬ: валидация данных
  productController.updateProductStatus
);

router.post(
  '/:id/related',
  authMiddleware(['admin']), // ДОБАВИТЬ
  validateObjectId('id'),
  validateProduct(Joi.object({ relatedProductId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required() })), // ДОБАВИТЬ
  productController.addRelatedProduct
);

module.exports = router;