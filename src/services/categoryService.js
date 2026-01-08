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
    
      // Обрабатываем изображения - преобразуем пути в полные URL
  const processedCategories = categories.map(category => {
    if (category.image && category.image.url) {
      const image = { ...category.image };
      image.url = fileService.getFileUrl(image.url);
      return { ...category, image };
    }
    return category;
  });

  
    // Добавляем количество продуктов
    if (withProductCount) {
      const categoriesWithCounts = await Promise.all(
        processedCategories.map(async (category) => {
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
    
    return processedCategories;
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
  let imageData = categoryData.image;
  
  // Если есть изображение
  if (imageData) {
    // Если это объект с URL
    if (imageData && imageData.url) {
      // Извлекаем путь из URL если это полный URL
      let imageUrl = imageData.url;
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const url = new URL(imageUrl);
        imageUrl = url.pathname; // Извлекаем только путь
        
        // Декодируем URL-encoded символы
        imageUrl = decodeURIComponent(imageUrl);
        imageData.url = imageUrl;
        console.log(`[CategoryService] Извлечен и декодирован путь из URL: ${imageUrl}`);
      }
      
      // Если путь из temp, перемещаем
      if (imageUrl.includes('/temp/')) {
        const newPath = await this.moveImageFromTemp(imageUrl);
        imageData.url = newPath;
      } else {
        // Если уже постоянный путь, проверяем существование
        await fileService.validateFileExists(imageUrl);
      }
    }
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
      throw ApiError.BadRequest('Категория с таким slug уже существует');
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
    // Если передан объект с url
    else if (updateData.image && updateData.image.url) {
      // Извлекаем путь из URL если это полный URL
      let imageUrl = updateData.image.url;
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const url = new URL(imageUrl);
        imageUrl = url.pathname; // Извлекаем только путь
        
        // Декодируем URL-encoded символы
        imageUrl = decodeURIComponent(imageUrl);
        updateData.image.url = imageUrl;
        console.log(`[CategoryService] Извлечен и декодирован путь из URL: ${imageUrl}`);
      }
      
      if (imageUrl.includes('/temp/')) {
        const newPath = await this.moveImageFromTemp(imageUrl);
        
        // Удаляем старое изображение
        if (existingCategory.image && existingCategory.image.url) {
          await fileService.deleteFile(existingCategory.image.url);
        }
        
        updateData.image.url = newPath;
      } else {
        // Если уже постоянный путь, проверяем существование
        await fileService.validateFileExists(imageUrl);
      }
    }
  }
  
  // Обновляем категорию
  Object.assign(existingCategory, updateData);
  existingCategory.updatedBy = userId;
  
  await existingCategory.save();
  return existingCategory.toObject();
}
  
  // Переместить изображение из временной папки

async moveImageFromTemp(tempPath) {
  console.log(`[CategoryService] moveImageFromTemp вызван с путем: ${tempPath}`);
  
  // Извлекаем путь из URL если это полный URL
  let cleanPath = tempPath;
  if (tempPath.startsWith('http://') || tempPath.startsWith('https://')) {
    const url = new URL(tempPath);
    cleanPath = url.pathname; // Извлекаем только путь
    
    // Декодируем URL-encoded символы (например, %20 -> пробел)
    cleanPath = decodeURIComponent(cleanPath);
    console.log(`[CategoryService] Извлечен и декодирован путь из URL: ${cleanPath}`);
  }
  
  // Проверяем, что путь ведет в temp
  if (!cleanPath.includes('/temp/')) {
    console.log(`[CategoryService] Путь не из temp, возвращаем как есть: ${cleanPath}`);
    return cleanPath; // Если уже не из temp, возвращаем как есть
  }
  
  // Проверяем существование файла
  await fileService.validateFileExists(cleanPath);
  
  // Генерируем новый путь
  const filename = path.basename(cleanPath);
  const timestamp = Date.now();
  const newWebPath = `/uploads/categories/images/${timestamp}_${filename}`;
  
  // Получаем абсолютные пути файловой системы
  const sourceAbsolute = fileService.getAbsolutePath(cleanPath);
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