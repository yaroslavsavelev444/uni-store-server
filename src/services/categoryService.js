const ApiError = require('../exceptions/api-error');
const { CategoryModel, ProductModel } = require('../models/index.models');
const fileService = require('../utils/fileManager');
const mongoose = require('mongoose');
const path = require('path');
  const fs = require('fs').promises;

class CategoryService {
  
  // Получить все категории с фильтрацией
  async getAllCategories(filters = {}, options = {}) {
    const {
      active = true,
      search,
      sortBy = 'order',
      sortOrder = 'asc',
      includeInactive = false,
      withProductCount = true
    } = options;
    
    // Базовый запрос
    const query = {};
    
    // Фильтрация по активности
    if (!includeInactive) {
      query.isActive = active;
    }
    
    
    // Поиск по названию
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Настройка сортировки
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Выполняем запрос
    const categories = await CategoryModel.find(query)
      .sort(sortOptions)
      .lean();

  
    // Добавляем количество продуктов
    if (withProductCount) {
      const categoriesWithCounts = await Promise.all(
        categories.map(async (category) => {
          const count = await ProductModel.countDocuments({
            category: category._id,
            isVisible: true,
            status: { $in: ['available', 'preorder'] }
          });
          
          return {
            ...category,
            productCount: count
          };
        })
      );
      
      return categoriesWithCounts;
    }
    
    return categories;
  }
  
  // Получить категорию по ID
  async getCategoryById(id, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID категории');
    }
    
    const category = await CategoryModel.findById(id).lean();
    
    if (!category) {
      throw ApiError.NotFound('Категория не найдена');
    }
    
    if (!category.isActive && !options.includeInactive) {
      throw ApiError.NotFound('Категория не доступна');
    }
    
    // Добавляем количество продуктов
    if (options.withProductCount) {
      const productCount = await ProductModel.countDocuments({
        category: category._id,
        isVisible: true,
        status: { $in: ['available', 'preorder'] }
      });
      
      category.productCount = productCount;
    }
    
    return category;
  }
  
  // Получить категорию по slug
  async getCategoryBySlug(slug, options = {}) {
    const category = await CategoryModel.findOne({ slug }).lean();
    
    if (!category) {
      throw ApiError.NotFound('Категория не найдена');
    }
    
    if (!category.isActive && !options.includeInactive) {
      throw ApiError.NotFound('Категория не доступна');
    }
    
    // Добавляем количество продуктов
    if (options.withProductCount) {
      const productCount = await ProductModel.countDocuments({
        category: category._id,
        isVisible: true,
        status: { $in: ['available', 'preorder'] }
      });
      
      category.productCount = productCount;
    }
    
    return category;
  }
  
async createCategory(categoryData, userId) {
  // Проверяем уникальность slug
  if (categoryData.slug) {
    const existingCategory = await CategoryModel.findOne({ slug: categoryData.slug });
    if (existingCategory) {
      throw ApiError.BadRequest('Категория с таким slug уже существует');
    }
  }
  
  // Обрабатываем изображение
  if (categoryData.image?.url) {
    categoryData.image.url = await this.processImage(categoryData.image.url);
  }
  
  // Создаем категорию
  const category = new CategoryModel({
    ...categoryData,
    createdBy: userId,
    updatedBy: userId
  });
  
  await category.save();
  return category.toObject();
}

// Обновить категорию
async updateCategory(id, updateData, userId) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.BadRequest('Некорректный формат ID категории');
  }
  
  // Проверяем существование категории
  const existingCategory = await CategoryModel.findById(id);
  if (!existingCategory) {
    throw ApiError.NotFound('Категория не найдена');
  }
  
  // Если меняется slug, проверяем уникальность
  if (updateData.slug && updateData.slug !== existingCategory.slug) {
    const duplicateCategory = await CategoryModel.findOne({ slug: updateData.slug });
    if (duplicateCategory) {
      throw ApiError.BadRequest('Категория с таким slug уже существует');
    }
  }
  
  // Обрабатываем изображение
  if (updateData.image !== undefined) {
    if (updateData.image === null) {
      if (existingCategory.image?.url) {
        await fileService.deleteFile(existingCategory.image.url);
      }
      updateData.image = null;
    } 

    
    else if (updateData.image?.url) {
      const newImageUrl = await this.processImage(updateData.image.url);
      
      // Удаляем старое изображение
      if (existingCategory.image?.url) {
        await fileService.deleteFile(existingCategory.image.url);
      }
      
      updateData.image.url = newImageUrl;
    }
  }
  
  // Обновляем категорию
  Object.assign(existingCategory, updateData);
  existingCategory.updatedBy = userId;
  
  await existingCategory.save();
  return existingCategory.toObject();
}

// Вспомогательный метод для обработки изображения
async processImage(imageUrl) {
  // Извлекаем путь из URL если это полный URL
  let filePath = imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const url = new URL(imageUrl);
    filePath = url.pathname;
    
    // Декодируем URL-encoded символы
    filePath = decodeURIComponent(filePath);
  }
  
  // Проверяем, является ли файл временным
  if (filePath.includes('/temp/')) {
    // Перемещаем файл в постоянную папку через fileService
    const timestamp = Date.now();
    const filename = path.basename(filePath);
    const newWebPath = `/uploads/categories/images/${timestamp}_${filename}`;
    
    await fileService.moveFile(filePath, newWebPath);
    return newWebPath;
  }
  
  // Если файл уже в постоянной папке, просто проверяем его существование
  await fileService.validateFileExists(filePath);
  return filePath;
}
  // Удалить категорию
  async deleteCategory(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID категории');
    }
    
    const category = await CategoryModel.findById(id);
    if (!category) {
      throw ApiError.NotFoundError('Категория не найдена');
    }
    
    // Проверяем, есть ли продукты в этой категории
    const productCount = await ProductModel.countDocuments({ category: id });
    if (productCount > 0) {
      throw ApiError.BadRequest('Невозможно удалить категорию с товарами');
    }
    
    // Удаляем изображение
    if (category.image && category.image.url) {
      await fileService.deleteFile(category.image.url);
    }
    
    // Удаляем категорию
    await category.deleteOne();
    
    return { success: true, message: 'Категория успешно удалена' };
  }
  
  // Получить список категорий (вместо дерева, так как нет иерархии)
  async getCategoryList(options = {}) {
    const { includeInactive = false } = options;
    
    const query = {};
    if (!includeInactive) {
      query.isActive = true;
    }
    
    const categories = await CategoryModel.find(query)
      .sort({ order: 1, name: 1 })
      .lean();
    
    // Добавляем количество продуктов для каждой категории
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const count = await ProductModel.countDocuments({
          category: category._id,
          isVisible: true,
          status: { $in: ['available', 'preorder'] }
        });
        
        return {
          ...category,
          productCount: count
        };
      })
    );
    
    return categoriesWithCounts;
  }
  
  // Получить количество продуктов в категории
  async getProductCount(categoryId) {
    return ProductModel.countDocuments({
      category: categoryId,
      isVisible: true,
      status: { $in: ['available', 'preorder'] }
    });
  }
}

module.exports = new CategoryService();