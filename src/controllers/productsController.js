const productService = require('../services/productService');
const ApiError = require('../exceptions/api-error');
const { ProductStatus } = require('../models/product-model');
const fs = require('fs').promises;
const path = require('path');
const { 
  processProductFiles, 
  cleanupOldProductFiles 
} = require('../utils/productFileProcessor');

const productController = {
  
  async getAllProducts(req, res, next) {
    try {
      const query = req.validatedQuery || {};
      
      // Преобразуем excludeIds в массив, если это строка
      if (query.excludeIds) {
        if (typeof query.excludeIds === 'string') {
          query.excludeIds = [query.excludeIds];
        } else if (Array.isArray(query.excludeIds)) {
          // Убедимся, что все ID валидны
          query.excludeIds = query.excludeIds.filter(id => 
            mongoose.Types.ObjectId.isValid(id)
          );
        }
      }

      console.log(`[GET_ALL_PRODUCTS] query: ${JSON.stringify(query)}`, req.user);
      const result = await productService.getAllProducts(query);
      console.log('resultresultresultresult', result);
      
      res.json({
        success: true,
        data: result.products,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  },

  async getProductById(req, res, next) {
    try {
      const { id } = req.params;
      const { populate = 'none' } = req.query;
      const isAdmin = req.user && req.user.role === 'admin';
      
      const product = await productService.getProductById(id, { populate, isAdmin });
      
      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      next(error);
    }
  },

  async getProductBySku(req, res, next) {
    try {
      const { sku } = req.params;
      const { populate = 'none' } = req.query;
      const isAdmin = req.user && req.user.role === 'admin';
      const userId = req.user && req.user.id;
      const product = await productService.getProductBySku(sku, { populate, isAdmin, userId });
      console.log('product',product );
      
      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      next(error);
    }
  },

  async createProduct(req, res, next) {
    try {
      const productData = req.validatedData;
      const userId = req.user.id;
      
      const processedData = await processProductFiles(productData);
      
      const product = await productService.createProduct(processedData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Продукт успешно создан',
        data: product
      });
    } catch (error) {
      next(error);
    }
  },
  
  async updateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.validatedData;
      const userId = req.user.id;

      const processedData = await processProductFiles(updateData);
      const existingProduct = await productService.getProductById(id, { isAdmin: true });
      const product = await productService.updateProduct(id, processedData, userId);

      res.json({
        success: true,
        message: 'Продукт успешно обновлен',
        data: product
      });
    } catch (error) {
      console.error("[UPDATE_PRODUCT] error", error);
      next(error);
    }
  },

  async getHints(req, res, next) {
    try {
      const { q } = req.query;
      if (!q || q.length < 2) {
        return res.json([]); // минимум 2 символа
      }

      const result = await productService.getHints(q);
      console.log("[GET_HINTS_PRODUCT] result", JSON.stringify(result));
      return res.status(200).json(result);
    } catch (error) {
      const errorMessage = error?.message || "Unknown error";
      console.error(`[GET_HINTS_PRODUCT] ${errorMessage}`);
      next(
        error instanceof ApiError
          ? error
          : ApiError.InternalServerError(errorMessage)
      );
    }
  },

  async saveSearchHistory(req, res, next) {
    try {
      const { productId: rawProductId } = req.body;
      
      const productId =
        typeof rawProductId === "object" && rawProductId.selectedProductId
          ? rawProductId.selectedProductId
          : rawProductId;

      if (!productId) throw ApiError.BadRequest("Недостаточно данных");

      const record = await productService.saveSearchHistory(
        req.user.id,
        productId
      );

      res.json(record);
    } catch (err) {
      next(err);
    }
  },

  async getSimilarProducts(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 4, strategy = 'mixed' } = req.query;
      
      // Получаем текущий продукт
      const currentProduct = await productService.getProductById(id, { populate: 'category' });
      
      if (!currentProduct) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      let similarProducts = [];
      
      const limitNum = parseInt(limit);
      
      switch (strategy) {
        case 'category':
          // Поиск по категории
          const categoryResult = await productService.getAllProducts({
            category: currentProduct.category?._id,
            excludeIds: [id],
            limit: limitNum,
            sortBy: 'popularity'
          });
          similarProducts = categoryResult.products || [];
          break;
          
        case 'price':
          // Поиск по ценовому диапазону (±30%)
          const priceRange = {
            minPrice: currentProduct.priceForIndividual * 0.7,
            maxPrice: currentProduct.priceForIndividual * 1.3,
            excludeIds: [id],
            limit: limitNum,
            sortBy: 'popularity'
          };
          const priceResult = await productService.getAllProducts(priceRange);
          similarProducts = priceResult.products || [];
          break;
          
        case 'mixed':
        default:
          // Комбинированная стратегия: сначала по категории, потом по цене
          const categoryQuery = {
            category: currentProduct.category?._id,
            excludeIds: [id],
            limit: limitNum,
            sortBy: 'popularity'
          };
          
          const categoryResultMixed = await productService.getAllProducts(categoryQuery);
          const categoryProducts = categoryResultMixed.products || [];
          
          if (categoryProducts.length < limitNum) {
            const remaining = limitNum - categoryProducts.length;
            const priceRangeMixed = {
              minPrice: currentProduct.priceForIndividual * 0.7,
              maxPrice: currentProduct.priceForIndividual * 1.3,
              excludeIds: [id, ...categoryProducts.map(p => p._id)],
              limit: remaining,
              sortBy: 'popularity'
            };
            const priceResultMixed = await productService.getAllProducts(priceRangeMixed);
            const additionalProducts = priceResultMixed.products || [];
            similarProducts = [...categoryProducts, ...additionalProducts];
          } else {
            similarProducts = categoryProducts.slice(0, limitNum);
          }
          break;
      }
      
      // Обрезаем до лимита на всякий случай
      similarProducts = similarProducts.slice(0, limitNum);
      
      res.json({
        success: true,
        data: similarProducts
      });
    } catch (error) {
      next(error);
    }
  },

  // Метод для получения продуктов по категории с поддержкой excludeIds
  async getProductsByCategory(req, res, next) {
    try {
      const { categoryId } = req.params;
      const { 
        limit = 20, 
        excludeIds,
        sortBy = 'popularity',
        sortOrder = 'desc'
      } = req.query;
      
      const result = await productService.getAllProducts({
        category: categoryId,
        excludeIds: excludeIds ? 
          (Array.isArray(excludeIds) ? excludeIds : [excludeIds]) : 
          undefined,
        limit: parseInt(limit),
        sortBy,
        sortOrder
      });
      
      res.json({
        success: true,
        data: result.products,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  },

  async getSearchHistory(req, res, next) {
    try {
      const history = await productService.getSearchHistory(req.user.id);
      res.json(history);
    } catch (err) {
      next(err);
    }
  },

  async clearSearchHistory(req, res, next) {
    try {
      const result = await productService.clearSearchHistory(req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async updateProductStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.validatedData;
      const userId = req.user.id;
      
      const product = await productService.updateProductStatus(id, status, userId);
      
      res.json({
        success: true,
        message: `Статус продукта изменен на "${status}"`,
        data: product
      });
    } catch (error) {
      next(error);
    }
  },

  
  async getRelatedProducts(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 10 } = req.query;
      
      const relatedProducts = await productService.getRelatedProducts(id, { limit });
      
      res.json({
        success: true,
        data: relatedProducts
      });
    } catch (error) {
      next(error);
    }
  },
  
  async addRelatedProduct(req, res, next) {
    try {
      const { id } = req.params;
      const { relatedProductId } = req.validatedData;
      const userId = req.user.id;
      
      // Защита от циклических ссылок
      if (id === relatedProductId) {
        throw ApiError.BadRequest('Продукт не может быть связан с самим собой');
      }
      
      const product = await productService.addRelatedProduct(id, relatedProductId, userId);
      
      res.json({
        success: true,
        message: 'Связанный продукт добавлен',
        data: product
      });
    } catch (error) {
      next(error);
    }
  },

  
  async searchProducts(req, res, next) {
    try {
      const { q: query, category, limit = 10, page = 1 } = req.validatedQuery;
      
      const result = await productService.searchProducts(query, { 
        limit, 
        page,
        category 
      });
      
      res.json({
        success: true,
        data: result.products,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  },
  
  async getProductStatuses(req, res, next) {
    try {
      const statuses = Object.entries(ProductStatus).map(([key, value]) => ({
        key,
        value,
        label: productController.getStatusLabel(value)
      }));
      
      res.json({
        success: true,
        data: statuses
      });
    } catch (error) {
      next(error);
    }
  },
  
  async validateLocalFileExists(filePath) {
    try {
      const normalizedPath = path.join(process.cwd(), 'public', filePath);
      
      // Проверка безопасности пути
      const absolutePath = path.resolve(normalizedPath);
      const publicPath = path.resolve(process.cwd(), 'public');
      
      if (!absolutePath.startsWith(publicPath)) {
        throw ApiError.BadRequest('Недопустимый путь к файлу');
      }
      
      // Используем fs.promises.access вместо fs.exists
      await fs.access(absolutePath, fs.constants.F_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw ApiError.BadRequest(`Файл не найден: ${filePath}`);
      }
      throw error;
    }
  },
  
  getStatusLabel(status) {
    const labels = {
      [ProductStatus.AVAILABLE]: 'Доступен',
      [ProductStatus.UNAVAILABLE]: 'Недоступен',
      [ProductStatus.PREORDER]: 'Предзаказ',
      [ProductStatus.ARCHIVED]: 'В архиве'
    };
    return labels[status] || status;
  }
};

module.exports = productController;