const productService = require('../services/productService');
const ApiError = require('../exceptions/api-error');
const { ProductStatus } = require('../models/product-model');
const fs = require('fs').promises;
const path = require('path');

class ProductController {
  
  async getAllProducts(req, res, next) {
    try {
      const query = req.validatedQuery || {};
      
      const result = await productService.getAllProducts(query);
      
      res.json({
        success: true,
        data: result.products,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
  
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
  }
  
  async createProduct(req, res, next) {
    try {
      const productData = req.validatedData;
      const userId = req.user.id;
      
      // Валидация файлов (опционально, только для локальных файлов)
      if (productData.mainImage && productData.mainImage.startsWith('/uploads/')) {
        await this.validateLocalFileExists(productData.mainImage);
      }
      
      if (productData.images && productData.images.length > 0) {
        for (const image of productData.images) {
          if (image.url.startsWith('/uploads/')) {
            await this.validateLocalFileExists(image.url);
          }
        }
      }
      
      if (productData.instructionFile && productData.instructionFile.url && 
          productData.instructionFile.url.startsWith('/uploads/')) {
        await this.validateLocalFileExists(productData.instructionFile.url);
      }
      
      const product = await productService.createProduct(productData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Продукт успешно создан',
        data: product
      });
    } catch (error) {
      next(error);
    }
  }
  
  async updateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.validatedData;
      const userId = req.user.id;
      
      // Валидация файлов
      if (updateData.mainImage && updateData.mainImage.startsWith('/uploads/')) {
        await this.validateLocalFileExists(updateData.mainImage);
      }
      
      if (updateData.images && updateData.images.length > 0) {
        for (const image of updateData.images) {
          if (image.url.startsWith('/uploads/')) {
            await this.validateLocalFileExists(image.url);
          }
        }
      }
      
      if (updateData.instructionFile && updateData.instructionFile.url && 
          updateData.instructionFile.url.startsWith('/uploads/')) {
        await this.validateLocalFileExists(updateData.instructionFile.url);
      }
      
      const product = await productService.updateProduct(id, updateData, userId);
      
      res.json({
        success: true,
        message: 'Продукт успешно обновлен',
        data: product
      });
    } catch (error) {
      next(error);
    }
  }
  
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
  }
  
  async deleteProduct(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const result = await productService.deleteProduct(id, userId);
      
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }
  
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
  }
  
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
  }
  
  async updateStock(req, res, next) {
    try {
      const { id } = req.params;
      const { quantity, operation = 'set', reason } = req.validatedData;
      const userId = req.user.id;
      
      const product = await productService.updateStock(id, quantity, operation, reason, userId);
      
      res.json({
        success: true,
        message: 'Количество на складе обновлено',
        data: product
      });
    } catch (error) {
      next(error);
    }
  }
  
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
  }
  
  async getProductStatuses(req, res, next) {
    try {
      const statuses = Object.entries(ProductStatus).map(([key, value]) => ({
        key,
        value,
        label: this.getStatusLabel(value)
      }));
      
      res.json({
        success: true,
        data: statuses
      });
    } catch (error) {
      next(error);
    }
  }
  
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
  }
  
  getStatusLabel(status) {
    const labels = {
      [ProductStatus.AVAILABLE]: 'Доступен',
      [ProductStatus.UNAVAILABLE]: 'Недоступен',
      [ProductStatus.PREORDER]: 'Предзаказ',
      [ProductStatus.ARCHIVED]: 'В архиве'
    };
    return labels[status] || status;
  }
}

module.exports = new ProductController();