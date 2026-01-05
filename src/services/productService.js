const ApiError = require('../exceptions/api-error');
const mongoose = require('mongoose');
const { ProductStatus } = require('../models/product-model');
const { ProductModel, UserSearchModel } = require('../models/index.models');
const CategoryModel = require('../models/category-model'); // ДОБАВЛЕНО
const fileService = require('../utils/fileManager');
const PurchaseCheckService = require('./purchaseCheckService');
const ReviewsService = require('./reviewService');
class ProductService {
  
  
  async getAllProducts(query = {}) {
    const {
      category,
      status,
      minPrice,
      maxPrice,
      inStock,
      search,
      slug, // ← это slug категории
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      populate = 'none',
      excludeIds,
      showOnMainPage,
      manufacturer,
      warrantyMonths
    } = query;
    
    const filter = {};
    
    // 1. Базовый фильтр по статусу и видимости
    if (status && Object.values(ProductStatus).includes(status)) {
      filter.status = status;
    } else {
      // По умолчанию показываем только доступные для покупки
      filter.status = { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] };
    }
    console.log('filter after status:', JSON.stringify(filter, 2));
    
    // 2. Фильтр по категории (через ID категории)
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        throw ApiError.BadRequest('Некорректный ID категории');
      }
      filter.category = category;
    }
    console.log('filter after category:', JSON.stringify(filter, 2));
    
    // 3. Фильтр по slug категории - ПРАВИЛЬНОЕ ИСПРАВЛЕНИЕ
    let categoryIdFromSlug = null;
    if (slug) {
      
      try {
        // Находим категорию по slug
        const categoryDoc = await CategoryModel.findOne({ slug });
        console.log('categoryDoc:', categoryDoc);
        
        if (!categoryDoc) {
          // Если категория не найдена, возвращаем пустой результат
          return {
            products: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0,
              hasNext: false,
              hasPrev: false
            }
          };
        }
        
        categoryIdFromSlug = categoryDoc._id;
        filter.category = categoryIdFromSlug;
        
      } catch (error) {
        console.error('Ошибка при поиске категории по slug:', error);
        throw ApiError.DatabaseError('Ошибка при поиске категории');
      }
    }
    console.log('filter after slug:', JSON.stringify(filter, 2));
    
    // 4. Фильтр по цене
    if (minPrice || maxPrice) {
      filter.priceForIndividual = {};
      if (minPrice) filter.priceForIndividual.$gte = parseFloat(minPrice);
      if (maxPrice) filter.priceForIndividual.$lte = parseFloat(maxPrice);
    }
    console.log('filter after minPrice and maxPrice:', JSON.stringify(filter, 2));
    
    // 5. Фильтр по наличию на складе
    if (inStock === 'true' || inStock === true) {
      filter.$and = [
        { stockQuantity: { $gt: 0 } },
        { status: ProductStatus.AVAILABLE }
      ];
    }
    console.log('filter after inStock:', JSON.stringify(filter, 2));
    
    // 6. Поиск по тексту
    if (search && search.trim().length > 0) {
      filter.$text = { $search: search.trim() };
    }
    console.log('filter after search:', JSON.stringify(filter, 2));
    
    // 7. Фильтр видимости
    filter.isVisible = true;
    console.log('filter after isVisible:', JSON.stringify(filter, 2));
    
    // 8. ИСКЛЮЧЕНИЕ ID продуктов (НОВОЕ)
    if (excludeIds && excludeIds.length > 0) {
      const validExcludeIds = excludeIds.filter(id => 
        mongoose.Types.ObjectId.isValid(id)
      );
      
      if (validExcludeIds.length > 0) {
        filter._id = { $nin: validExcludeIds };
      }
    }
    console.log('filter after excludeIds:', JSON.stringify(filter, 2));
    
    // 9. Дополнительные фильтры
    if (showOnMainPage) {
      filter.showOnMainPage= true;
    }
    if (manufacturer) {
      filter.manufacturer = { $regex: manufacturer, $options: 'i' };
    }
    if (warrantyMonths) {
      filter.warrantyMonths = { $gte: warrantyMonths };
    }
    console.log('filter after showOnMainPage and manufacturer and warrantyMonths:', JSON.stringify(filter, 2));
    
    // 10. Сортировка
    const sortOptions = {};
    const sortField = this.getSortField(sortBy);
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;
    console.log('sortOptions:', JSON.stringify(sortOptions, 2));
    
    // Для сортировки по популярности добавляем сортировку по названию как вторичную
    if (sortBy === 'popularity') {
      sortOptions.title = 1;
    }
    console.log('sortOptions after sorting by popularity:', JSON.stringify(sortOptions, 2));
    
    // 11. Пагинация
    const skip = (page - 1) * limit;
    console.log('skip:', skip);
    
    try {
      // 12. Используем стандартные запросы вместо агрегации для простоты
      let query = ProductModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean({ virtuals: true });
      
      // Популяция категории
      if (populate === 'category' || populate === 'all') {
        query = query.populate('category', 'name slug description _id');
      }
      
      // Популяция связанных продуктов
      if (populate === 'relatedProducts' || populate === 'all') {
        query = query.populate({
          path: 'relatedProducts',
          select: 'title priceForIndividual mainImage status discount _id',
          match: { 
            status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
            isVisible: true 
          },
          options: { limit: 10 }
        });
      }
      
      const [products, total] = await Promise.all([
        query,
        ProductModel.countDocuments(filter)
      ]);
      
      // 13. Рассчитываем финальные цены и добавляем виртуальные поля
      const productsWithReviewsPromises = products.map(async (product) => {
            // Рассчитываем финальную цену
            const finalPrice = this.calculateFinalPrice(product);
            
            // Рассчитываем доступное количество
            const availableQuantity = Math.max(
                0, 
                product.stockQuantity - (product.reservedQuantity || 0)
            );
            
            // Получаем количество отзывов ДЛЯ ЭТОГО продукта
            const reviewsCount = await ReviewsService.getProductReviewsCountStatic(product._id);
            
            // Проверяем наличие в наличии
            const inStock = availableQuantity > 0 && 
                           product.status === ProductStatus.AVAILABLE;
            
            return {
                ...product,
                finalPriceForIndividual: finalPrice,
                availableQuantity,
                inStock,
                reviewsCount: reviewsCount  // ← добавляем количество отзывов
            };
        });
        
        // Ждем выполнения ВСЕХ асинхронных операций
        const productsWithFinalPrice = await Promise.all(productsWithReviewsPromises);
        
        return {
            products: productsWithFinalPrice,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        };
    } catch (error) {
        console.error('Ошибка при получении продуктов:', error);
        throw ApiError.DatabaseError('Ошибка при получении продуктов');
    }
}


  

  async getSimilarProducts(productId, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    try {
      // 1. Получаем текущий продукт
      const currentProduct = await ProductModel.findById(productId)
        .select('category title priceForIndividual')
        .populate('category', 'name slug')
        .lean();
      
      if (!currentProduct) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      const categoryId = currentProduct.category?._id;
      const limit = options.limit || 4;
      
      if (!categoryId) {
        return [];
      }
      
      // 2. Параметры для поиска по категории
      const categoryQuery = {
        category: categoryId,
        excludeIds: [productId],
        limit: limit,
        sortBy: 'popularity',
        populate: 'none'
      };
      
      // 3. Получаем продукты из той же категории
      const categoryResult = await this.getAllProducts(categoryQuery);
      let similarProducts = categoryResult.products;
      
      // 4. Если продуктов недостаточно, ищем по цене
      if (similarProducts.length < limit) {
        const remaining = limit - similarProducts.length;
        
        // Исключаем уже найденные продукты
        const excludeAllIds = [
          productId,
          ...similarProducts.map(p => p._id.toString())
        ];
        
        // Ищем по ценовому диапазону
        const priceRangeQuery = {
          minPrice: currentProduct.priceForIndividual * 0.7,
          maxPrice: currentProduct.priceForIndividual * 1.3,
          excludeIds: excludeAllIds,
          limit: remaining,
          sortBy: 'popularity',
          populate: 'none'
        };
        
        const priceResult = await this.getAllProducts(priceRangeQuery);
        similarProducts = [...similarProducts, ...priceResult.products];
      }
      
      return similarProducts.slice(0, limit);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error('Ошибка при получении похожих продуктов:', error);
      throw ApiError.DatabaseError('Ошибка при получении похожих продуктов');
    }
  }

  
  async getProductById(id, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    try {
      let query = ProductModel.findById(id);
      
      if (options.populate === 'category' || options.populate === 'all') {
        query = query.populate('category', 'name slug description _id');
      }
      
      if (options.populate === 'relatedProducts' || options.populate === 'all') {
        query = query.populate('relatedProducts', 
          'title sku priceForIndividual mainImage status _id');
      }
      
      const product = await query.lean({ virtuals: true });
      
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      // Проверка видимости для не-админов
      if (!options.isAdmin && !product.isVisible) {
        throw ApiError.NotFound('Продукт не доступен');
      }
      
      // Проверка существования категории
      if (product.category && !product.category._id) {
        throw ApiError.NotFound('Категория продукта не найдена');
      }
      
      // Рассчитываем финальную цену
      product.finalPriceForIndividual = this.calculateFinalPrice(product);
      
      return product;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при получении продукта');
    }
  }
  

  async getProductBySku(sku, options = {}) {
    try {
      let query = ProductModel.findOne({ sku });
      
      if (options.populate === 'category' || options.populate === 'all') {
        query = query.populate('category', 'name slug description _id');
      }
      
      if (options.populate === 'relatedProducts' || options.populate === 'all') {
        query = query.populate('relatedProducts', 
          'title sku priceForIndividual mainImage status _id');
      }
      
      const product = await query.lean({ virtuals: true });
      
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      // Проверка видимости для не-админов
      if (!options.isAdmin && !product.isVisible) {
        throw ApiError.NotFound('Продукт не доступен');
      }
      
      // Проверка существования категории
      if (product.category && !product.category._id) {
        throw ApiError.NotFound('Категория продукта не найдена');
      }
      
      // Рассчитываем финальную цену
      product.finalPriceForIndividual = this.calculateFinalPrice(product);
      
      // Добавляем флаг покупки, если передан userId
      if (options.userId) {
        product.hasPurchased = await PurchaseCheckService.hasUserPurchasedProduct(
          options.userId, 
          product._id.toString()
        );

        product.hasReviewed = await ReviewsService.checkIfUserHasReviewedStatic(
          options.userId, 
          product._id.toString()
        );

      }
      
      return product;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при получении продукта');
    }
  }

  async createProduct(productData, userId) {
    try {
      // Проверка уникальности SKU
      const existingProduct = await ProductModel.findOne({ sku: productData.sku });
      if (existingProduct) {
        throw ApiError.BadRequest('Продукт с таким SKU уже существует');
      }
      
      // Проверка существования категории
      const categoryExists = await CategoryModel.findById(productData.category);
      if (!categoryExists) {
        throw ApiError.BadRequest('Указанная категория не существует');
      }
      
      // Проверка связанных продуктов
      await this.validateRelatedProducts(productData);
      
      // Обрабатываем изображения для сохранения в БД
      const processedImages = await this.processImagesForDb(productData.images);
      
      const product = new ProductModel({
        ...productData,
        images: processedImages,
        createdBy: userId,
        updatedBy: userId
      });
      
      await product.save();
      
      return this.formatProductForResponse(product);
    } catch (error) {
      // Откат: удаляем загруженные файлы если что-то пошло не так
      await this.rollbackProductFiles(productData);
      
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при создании продукта');
    }
  }
  
  async updateProduct(id, updateData, userId) {
    console.log('updateProduct called with id:', id, 'and updateData:', updateData);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    try {
      const product = await ProductModel.findById(id);
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      console.log('found product:', product);
      
      // Проверка SKU на уникальность
      if (updateData.sku && updateData.sku !== product.sku) {
        const existingProduct = await ProductModel.findOne({ 
          sku: updateData.sku,
          _id: { $ne: id }
        });
        if (existingProduct) {
          throw ApiError.BadRequest('Продукт с таким SKU уже существует');
        }
      }
      
      console.log('validated sku');
      
      // Проверка категории
      if (updateData.category) {
        const categoryExists = await CategoryModel.findById(updateData.category);
        if (!categoryExists) {
          throw ApiError.BadRequest('Указанная категория не существует');
        }
      }
      
      console.log('validated category');
      
      // Проверка связанных продуктов
      await this.validateRelatedProducts(updateData, id);
      
      console.log('validated related products');
      
      // Сохраняем старые данные файлов для отката
      const oldImages = [...product.images];
      const oldMainImage = product.mainImage;
      const oldInstruction = product.instructionFile;
      
      console.log('old images:', oldImages);
      console.log('old main image:', oldMainImage);
      console.log('old instruction:', oldInstruction);
      
      // Обрабатываем изображения
      if (updateData.images !== undefined) {
        if (updateData.images === null) {
          // Удаляем все изображения
          product.images = [];
        } else if (Array.isArray(updateData.images)) {
          // Обрабатываем новые изображения
          const processedImages = await this.processImagesForDb(
            updateData.images, 
            oldImages
          );
          product.images = processedImages;
        }
      }
      
      console.log('new images:', product.images);
      
      // Обрабатываем основное изображение
      if (updateData.mainImage !== undefined) {
        if (updateData.mainImage === null) {
          product.mainImage = null;
        } else if (updateData.mainImage.url) {
          // Проверяем что файл существует
          await fileService.validateFileExists(updateData.mainImage.url);
          product.mainImage = updateData.mainImage;
        }
      }
      
      console.log('new main image:', product.mainImage);
      
      // Обрабатываем инструкцию
      if (updateData.instructionFile !== undefined) {
        if (updateData.instructionFile === null) {
          product.instructionFile = null;
        } else if (updateData.instructionFile.url) {
          // Проверяем что файл существует
          await fileService.validateFileExists(updateData.instructionFile.url);
          product.instructionFile = updateData.instructionFile;
        }
      }
      
      console.log('new instruction:', product.instructionFile);
      
      // Обновление остальных полей
      Object.keys(updateData).forEach(key => {
        if (!['images', 'mainImage', 'instructionFile'].includes(key)) {
          product[key] = updateData[key];
        }
      });
      
      product.updatedBy = userId;
      product.updatedAt = new Date();
      
      await product.save();
      
      console.log('product saved');
      
      // Удаляем старые файлы которые больше не нужны
      await this.cleanupUnusedFiles(
        oldImages, 
        product.images, 
        oldMainImage, 
        product.mainImage,
        oldInstruction,
        product.instructionFile
      );
      
      console.log('unused files cleaned up');
      
      return this.formatProductForResponse(product);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при обновлении продукта');
    }
  }
  
  /**
   * Обработка изображений для сохранения в БД
   */
  async processImagesForDb(images, existingImages = []) {
    if (!images || !Array.isArray(images)) {
      return [];
    }
    
    const processedImages = [];
    const existingUrls = existingImages.map(img => img.url);
    
    for (const image of images) {
      if (image._shouldDelete) {
        // Пропускаем изображения помеченные на удаление
        continue;
      }
      
      if (image.url) {
        // Если изображение уже существует (из БД), сохраняем как есть
        if (existingUrls.includes(image.url)) {
          const existingImage = existingImages.find(img => img.url === image.url);
          if (existingImage) {
            processedImages.push(existingImage);
          }
          continue;
        }
        
        // Проверяем что новый файл существует
        await fileService.validateFileExists(image.url);
        
        // Сохраняем изображение
        processedImages.push({
          url: image.url,
          alt: image.alt || '',
          order: image.order || processedImages.length
        });
      }
    }
    
    return processedImages;
  }
  
  /**
   * Удаление неиспользуемых файлов
   */
  async cleanupUnusedFiles(oldImages, newImages, oldMainImage, newMainImage, oldInstruction, newInstruction) {
    // Удаляем старые изображения галереи которые больше не используются
    const oldImageUrls = oldImages.map(img => img.url);
    const newImageUrls = newImages.map(img => img.url);
    
    const galleryImagesToDelete = oldImageUrls.filter(url => !newImageUrls.includes(url));
    for (const imageUrl of galleryImagesToDelete) {
      try {
        await fileService.deleteFile(imageUrl);
      } catch (error) {
        console.warn(`Не удалось удалить изображение: ${error.message}`);
      }
    }
    
    // Удаляем старое основное изображение если оно изменилось
    if (oldMainImage && oldMainImage.url && 
        (!newMainImage || newMainImage.url !== oldMainImage.url)) {
      try {
        await fileService.deleteFile(oldMainImage.url);
      } catch (error) {
        console.warn(`Не удалось удалить основное изображение: ${error.message}`);
      }
    }
    
    // Удаляем старую инструкцию если она изменилась
    if (oldInstruction && oldInstruction.url && 
        (!newInstruction || newInstruction.url !== oldInstruction.url)) {
      try {
        await fileService.deleteFile(oldInstruction.url);
      } catch (error) {
        console.warn(`Не удалось удалить инструкцию: ${error.message}`);
      }
    }
  }
  
  /**
   * Откат загруженных файлов при ошибке создания
   */
  async rollbackProductFiles(productData) {
    const filesToDelete = [];
    
    // Основное изображение
    if (productData.mainImage && productData.mainImage.url) {
      filesToDelete.push(productData.mainImage.url);
    }
    
    // Изображения галереи
    if (productData.images && Array.isArray(productData.images)) {
      productData.images.forEach(image => {
        if (image.url) {
          filesToDelete.push(image.url);
        }
      });
    }
    
    // Инструкция
    if (productData.instructionFile && productData.instructionFile.url) {
      filesToDelete.push(productData.instructionFile.url);
    }
    
    // Удаляем файлы
    for (const fileUrl of filesToDelete) {
      try {
        await fileService.deleteFile(fileUrl);
      } catch (error) {
        console.warn(`Не удалось удалить файл при откате: ${error.message}`);
      }
    }
  }
  
  /**
   * Форматирование продукта для ответа
   */
  formatProductForResponse(product) {
    const productObj = product.toObject ? product.toObject() : product;
    
    // Преобразуем пути файлов в полные URL
    if (productObj.mainImage && productObj.mainImage.url) {
      productObj.mainImage.url = fileService.getFileUrl(productObj.mainImage.url);
    }
    
    if (productObj.images && Array.isArray(productObj.images)) {
      productObj.images = productObj.images.map(img => ({
        ...img,
        url: fileService.getFileUrl(img.url)
      }));
    }
    
    if (productObj.instructionFile && productObj.instructionFile.url) {
      productObj.instructionFile.url = fileService.getFileUrl(productObj.instructionFile.url);
    }
    
    // Рассчитываем финальную цену
    productObj.finalPriceForIndividual = this.calculateFinalPrice(productObj);
    
    return productObj;
  }
  async updateProductStatus(id, status, userId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    if (!Object.values(ProductStatus).includes(status)) {
      throw ApiError.BadRequest('Некорректный статус продукта');
    }
    
    try {
      const product = await ProductModel.findByIdAndUpdate(
        id,
        { 
          status,
          updatedBy: userId,
          updatedAt: new Date(),
          ...(status === ProductStatus.ARCHIVED && { isVisible: false })
        },
        { new: true, runValidators: true }
      ).lean({ virtuals: true });
      
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      return product;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при обновлении статуса продукта');
    }
  }
  
  async deleteProduct(id, userId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    try {
      const product = await ProductModel.findById(id);
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      // Проверка на наличие заказов
      const hasOrders = await this.checkProductOrders(id);
      if (hasOrders) {
        // Архивация вместо удаления
        product.status = ProductStatus.ARCHIVED;
        product.isVisible = false;
        product.updatedBy = userId;
        await product.save();
        
        return { 
          success: true, 
          message: 'Продукт архивирован (имеются заказы)',
          archived: true 
        };
      }
      
      // Удаление продукта
      await ProductModel.findByIdAndDelete(id);
      
      return { 
        success: true, 
        message: 'Продукт удален',
        archived: false 
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при удалении продукта');
    }
  }


  async getHints(query) {
  let results = [];

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
  try {
    // Удаляем лишние пробелы и экранируем спецсимволы
    const sanitizedQuery = query.trim();
    const escapedQuery = escapeRegex(sanitizedQuery);
    
    // Если запрос похож на SKU (только буквы, цифры, дефисы и подчеркивания)
    const isPossibleSku = /^[a-zA-Z0-9_-]+$/.test(sanitizedQuery);
    
    if (isPossibleSku) {
      // Приоритетный поиск по SKU (точное совпадение или начало)
      results = await ProductModel.find({
        $or: [
          { sku: sanitizedQuery }, // Точное совпадение
          { sku: new RegExp(`^${escapedQuery}`, 'i') }, // Начинается с
        ],
        status: { $in: ["available", "preorder"] }, // Только доступные товары
        isVisible: true // Только видимые
      })
      .select("title sku mainImage priceForIndividual discount status stockQuantity category")
      .populate('category', 'name slug')
      .limit(10);
    }

    // Если не нашли по SKU или SKU поиск не подошел
    if (!results || results.length === 0) {
      // Сначала пробуем полнотекстовый поиск
      results = await ProductModel.find(
        { 
          $text: { $search: sanitizedQuery }, 
          status: { $in: ["available", "preorder"] },
          isVisible: true 
        },
        { 
          score: { $meta: "textScore" } 
        }
      )
      .sort({ 
        score: { $meta: "textScore" },
        title: 1 
      })
      .select("title sku mainImage priceForIndividual discount status stockQuantity category")
      .populate('category', 'name slug')
      .limit(10);

      // Если полнотекстовый поиск ничего не нашел → fallback через regex
      if (!results || results.length === 0) {
        results = await ProductModel.find({
          $or: [
            { title: new RegExp(escapedQuery, "i") },
            { description: new RegExp(escapedQuery, "i") },
            { manufacturer: new RegExp(escapedQuery, "i") },
            { 'keywords': new RegExp(escapedQuery, "i") }
          ],
          status: { $in: ["available", "preorder"] },
          isVisible: true
        })
        .select("title sku mainImage priceForIndividual discount status stockQuantity category")
        .populate('category', 'name slug')
        .limit(10);
      }
    }

    // Форматируем результаты для фронтенда
    const formattedResults = results.map(product => {
      // Вычисляем финальную цену с учетом скидки
      let finalPrice = product.priceForIndividual;
      if (product.discount?.isActive) {
        const now = new Date();
        const validFrom = product.discount.validFrom || new Date(0);
        const validUntil = product.discount.validUntil || new Date('9999-12-31');
        
        if (now >= validFrom && now <= validUntil) {
          if (product.discount.percentage > 0) {
            finalPrice = finalPrice * (1 - product.discount.percentage / 100);
          }
          if (product.discount.amount > 0) {
            finalPrice = Math.max(0, finalPrice - product.discount.amount);
          }
          finalPrice = Math.round(finalPrice * 100) / 100;
        }
      }

      // Определяем доступность
      const isAvailable = product.status === "available" && 
                         (product.stockQuantity - (product.reservedQuantity || 0)) > 0;
      const isPreorder = product.status === "preorder";

      return {
        value: product._id.toString(),
        label: product.title,
        sku: product.sku,
        price: finalPrice,
        originalPrice: product.discount?.isActive ? product.priceForIndividual : null,
        hasDiscount: product.discount?.isActive || false,
        image: product.mainImage,
        category: product.category?.name || null,
        isAvailable,
        isPreorder,
        stock: product.stockQuantity - (product.reservedQuantity || 0),
        raw: product.toObject() // Отправляем все данные для расширенной обработки
      };
    });

    console.log(`[productSearchService] query="${query}" results=${formattedResults.length}`);
    return formattedResults;
  } catch (err) {
    console.error(`[productSearchService] Error: ${err.message}`);
    throw err;
  }
};


async saveSearchHistory (userId, productId) {
  if (!userId) throw new Error("userId is required");
  if (!productId) throw new Error("listingId is required");

  try {
    // Найти элемент и обновить updatedAt, или вставить новый, если его нет
    const record = await UserSearchModel.findOneAndUpdate(
      { userId, selectedProductId: productId }, // уникальный ключ
      { $currentDate: { updatedAt: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return record;
  } catch (err) {
    console.error("[saveSearchHistory] error:", err);
    throw err;
  }
};

async clearSearchHistory (userId) {
  try {
    return await UserSearchModel.deleteMany({ userId });
  } catch (err) {
    throw err;
  }
};

async getSearchHistory (userId) {
  try {
    const history = await UserSearchModel.find({ userId })
      .populate("selectedProductId", "title sku")
      .sort({ updatedAt: -1 })
      .limit(15);

    return history;
  } catch (err) {
    throw err;
  }
};

  async addRelatedProduct(productId, relatedProductId, userId) {
    if (!mongoose.Types.ObjectId.isValid(productId) || 
        !mongoose.Types.ObjectId.isValid(relatedProductId)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    if (productId === relatedProductId) {
      throw ApiError.BadRequest('Продукт не может быть связан с самим собой');
    }
    
    try {
      const [product, relatedProduct] = await Promise.all([
        ProductModel.findById(productId),
        ProductModel.findById(relatedProductId)
      ]);
      
      if (!product || !relatedProduct) {
        throw ApiError.NotFound('Один из продуктов не найден');
      }
      
      if (product.relatedProducts.includes(relatedProductId)) {
        throw ApiError.BadRequest('Продукт уже связан');
      }
      
      product.relatedProducts.push(relatedProductId);
      product.updatedBy = userId;
      await product.save();
      
      return product.toObject({ virtuals: true });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при добавлении связанного продукта');
    }
  }
  
  async getRelatedProducts(productId, options = {}) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    try {
      const product = await ProductModel.findById(productId)
        .populate({
          path: 'relatedProducts',
          select: 'title sku priceForIndividual mainImage status discount',
          match: { 
            status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
            isVisible: true 
          },
          options: { limit: options.limit || 10 }
        })
        .lean({ virtuals: true });
      
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      // Рассчитываем финальные цены для связанных продуктов
      const relatedProductsWithPrice = product.relatedProducts.map(p => ({
        ...p,
        finalPriceForIndividual: this.calculateFinalPrice(p)
      }));
      
      return relatedProductsWithPrice;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при получении связанных продуктов');
    }
  }
  
  async updateStock(id, quantity, operation, reason, userId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    try {
      const product = await ProductModel.findById(id);
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      let newQuantity;
      switch (operation) {
        case 'set':
          newQuantity = quantity;
          break;
        case 'add':
          newQuantity = product.stockQuantity + quantity;
          break;
        case 'subtract':
          newQuantity = product.stockQuantity - quantity;
          break;
        default:
          throw ApiError.BadRequest('Некорректная операция');
      }
      
      if (newQuantity < 0) {
        throw ApiError.BadRequest('Недостаточное количество на складе');
      }
      
      product.stockQuantity = newQuantity;
      
      // Обновление статуса при изменении количества
      if (newQuantity === 0 && product.status === ProductStatus.AVAILABLE) {
        product.status = ProductStatus.UNAVAILABLE;
      } else if (newQuantity > 0 && product.status === ProductStatus.UNAVAILABLE) {
        product.status = ProductStatus.AVAILABLE;
      }
      
      product.updatedBy = userId;
      
      // Логирование изменения склада
      await this.logStockChange(id, quantity, operation, reason, userId, 
        product.stockQuantity);
      
      await product.save();
      
      return product.toObject({ virtuals: true });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при обновлении количества на складе');
    }
  }
  
  async searchProducts(query, options = {}) {
    const { limit = 10, page = 1, category } = options;
    
    try {
      const searchFilter = {
        $text: { $search: query },
        status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
        isVisible: true
      };
      
      if (category) {
        searchFilter.category = category;
      }
      
      const skip = (page - 1) * limit;
      
      const [products, total] = await Promise.all([
        ProductModel.find(searchFilter)
          .select('title sku priceForIndividual mainImage category description')
          .populate('category', 'name')
          .sort({ score: { $meta: "textScore" } })
          .skip(skip)
          .limit(limit)
          .lean({ virtuals: true }),
        ProductModel.countDocuments(searchFilter)
      ]);
      
      const productsWithPrice = products.map(product => ({
        ...product,
        finalPriceForIndividual: this.calculateFinalPrice(product)
      }));
      
      return {
        products: productsWithPrice,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw ApiError.DatabaseError('Ошибка при поиске продуктов');
    }
  }
  
  calculateFinalPrice(product) {
    if (!product.discount?.isActive) {
      return product.priceForIndividual;
    }
    
    const discount = product.discount;
    const now = new Date();
    
    // Проверка срока действия скидки
    if (discount.validFrom && now < new Date(discount.validFrom)) {
      return product.priceForIndividual;
    }
    if (discount.validUntil && now > new Date(discount.validUntil)) {
      return product.priceForIndividual;
    }
    
    let finalPrice = product.priceForIndividual;
    
    // Применение процентной скидки
    if (discount.percentage > 0) {
      finalPrice = finalPrice * (1 - discount.percentage / 100);
    }
    
    // Применение фиксированной скидки
    if (discount.amount > 0) {
      finalPrice = Math.max(0, finalPrice - discount.amount);
    }
    
    return Math.round(finalPrice * 100) / 100;
  }
  
  async validateRelatedProducts(productData, excludeId = null) {
    const relatedFields = ['relatedProducts', 'upsellProducts', 'crossSellProducts'];
    
    for (const field of relatedFields) {
      if (productData[field] && Array.isArray(productData[field])) {
        // Проверка уникальности ID в массиве
        const uniqueIds = [...new Set(productData[field])];
        if (uniqueIds.length !== productData[field].length) {
          throw ApiError.BadRequest(`Дублирующиеся ID в поле ${field}`);
        }
        
        // Проверка существования продуктов
        const existingProducts = await ProductModel.find({
          _id: { $in: productData[field] },
          ...(excludeId && { _id: { $ne: excludeId } })
        }).select('_id');
        
        const existingIds = existingProducts.map(p => p._id.toString());
        const missingIds = productData[field].filter(id => !existingIds.includes(id));
        
        if (missingIds.length > 0) {
          throw ApiError.BadRequest(`Некоторые связанные продукты не существуют: ${missingIds.join(', ')}`);
        }
      }
    }
  }
  
  async checkProductOrders(productId) {
    // Здесь должна быть реализация проверки заказов
    // Временно возвращаем false
    return false;
  }
  
  async logStockChange(productId, quantity, operation, reason, userId, newQuantity) {
    // Реализация логирования изменений склада
    // Можно использовать отдельную модель StockLog
  }
  
  getSortField(sortBy) {
    const sortMap = {
      'price': 'priceForIndividual',
      'title': 'title',
      'createdAt': 'createdAt',
      'updatedAt': 'updatedAt',
      'popularity': 'viewsCount', // Предполагаемое поле
      'stockQuantity': 'stockQuantity'
    };
    
    return sortMap[sortBy] || 'createdAt';
  }
}

module.exports = new ProductService();