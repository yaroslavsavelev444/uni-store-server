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
  
  // Создать категорию
  async createCategory(categoryData, userId) {
    // Проверяем уникальность slug
    if (categoryData.slug) {
      const existingCategory = await CategoryModel.findOne({ slug: categoryData.slug });
      if (existingCategory) {
        throw ApiError.Conflict('Категория с таким slug уже существует');
      }
    }
    
    // Обрабатываем изображение
    let imageData = categoryData.image;
    
    // Если передана строка (путь из temp), перемещаем файл
    if (typeof imageData === 'string') {
      const newPath = await this.moveImageFromTemp(imageData);
      imageData = { url: newPath };
    }
    
    // Проверяем существование файла
    if (imageData && imageData.url) {
      await fileService.validateFileExists(imageData.url);
    }
    
    // Создаем категорию
    const category = new CategoryModel({
      ...categoryData,
      image: imageData,
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
        throw ApiError.Conflict('Категория с таким slug уже существует');
      }
    }
    
    // Обрабатываем изображение
    if (updateData.image !== undefined) {
      // Если передано null - удаляем изображение
      if (updateData.image === null) {
        if (existingCategory.image && existingCategory.image.url) {
          await fileService.deleteFile(existingCategory.image.url);
        }
        updateData.image = null;
      } 
      // Если передана строка (путь из temp)
      else if (typeof updateData.image === 'string') {
        const newPath = await this.moveImageFromTemp(updateData.image);
        
        // Удаляем старое изображение
        if (existingCategory.image && existingCategory.image.url) {
          await fileService.deleteFile(existingCategory.image.url);
        }
        
        updateData.image = { url: newPath };
      }
      // Если передан объект с url
      else if (updateData.image && updateData.image.url) {
        await fileService.validateFileExists(updateData.image.url);
      }
    }
    
    // Обновляем категорию
    Object.assign(existingCategory, updateData);
    existingCategory.updatedBy = userId;
    
    await existingCategory.save();
    return existingCategory.toObject();
  }
  
  // Переместить изображение из временной папки
// Переместить изображение из временной папки
async moveImageFromTemp(tempPath) {
  console.log(`[CategoryService] moveImageFromTemp вызван с путем: ${tempPath}`);
  
  // Проверяем, что путь ведет в temp
  if (!tempPath.includes('/temp/')) {
    throw ApiError.BadRequest('Изображение должно быть загружено во временную папку');
  }
  
  // Проверяем существование файла
  await fileService.validateFileExists(tempPath);
  
  // Генерируем новый путь
  const filename = path.basename(tempPath);
  const timestamp = Date.now();
  const newWebPath = `/uploads/categories/images/${timestamp}_${filename}`;
  
  // Получаем абсолютные пути файловой системы
  const sourceAbsolute = fileService.getAbsolutePath(tempPath);
  const targetAbsolute = fileService.getAbsolutePath(newWebPath);
  
  // Создаем папку назначения если нет
  const targetDir = path.dirname(targetAbsolute);
  await fs.mkdir(targetDir, { recursive: true });
  
  console.log(`[CategoryService] Перемещение файла:`);
  console.log(`  Из (абсолютный): ${sourceAbsolute}`);
  console.log(`  В (абсолютный):  ${targetAbsolute}`);
  console.log(`  В (веб-путь):    ${newWebPath}`);
  
  // Проверяем, что исходный файл существует
  try {
    await fs.access(sourceAbsolute);
    console.log(`[CategoryService] Исходный файл существует: ${sourceAbsolute}`);
  } catch (error) {
    console.error(`[CategoryService] Исходный файл не найден: ${sourceAbsolute}`, error);
    throw ApiError.BadRequest(`Исходный файл не найден: ${tempPath}`);
  }
  
  // Перемещаем файл
  try {
    await fs.rename(sourceAbsolute, targetAbsolute);
    console.log(`[CategoryService] Файл успешно перемещен`);
  } catch (error) {
    console.error(`[CategoryService] Ошибка при перемещении файла:`, error);
    
    // Альтернатива: копировать и удалить оригинал
    try {
      await fs.copyFile(sourceAbsolute, targetAbsolute);
      await fs.unlink(sourceAbsolute);
      console.log(`[CategoryService] Файл скопирован и оригинал удален`);
    } catch (copyError) {
      console.error(`[CategoryService] Ошибка при копировании файла:`, copyError);
      throw ApiError.InternalError(`Ошибка при перемещении файла: ${copyError.message}`);
    }
  }
  
  return newWebPath;
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