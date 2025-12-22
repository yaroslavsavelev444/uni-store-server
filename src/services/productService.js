const ApiError = require('../exceptions/api-error');
const mongoose = require('mongoose');
const { ProductStatus } = require('../models/product-model');
const { ProductModel } = require('../models/index.models');
const CategoryModel = require('../models/category-model'); // ДОБАВЛЕНО

class ProductService {
  
  async getAllProducts(query = {}) {
    const {
      category,
      status,
      minPrice,
      maxPrice,
      inStock,
      featured,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      populate = 'none'
    } = query;
    
    const filter = {};
    
    // Безопасный фильтр статуса
    if (status && Object.values(ProductStatus).includes(status)) {
      filter.status = status;
    } else {
      filter.status = { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] };
    }
    
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        throw ApiError.BadRequest('Некорректный ID категории');
      }
      filter.category = category;
    }
    
    // Фильтрация по цене (базовой, не финальной)
    if (minPrice || maxPrice) {
      filter.priceForIndividual = {};
      if (minPrice) filter.priceForIndividual.$gte = parseFloat(minPrice);
      if (maxPrice) filter.priceForIndividual.$lte = parseFloat(maxPrice);
    }
    
    if (inStock === 'true' || inStock === true) {
      filter.stockQuantity = { $gt: 0 };
    }
    
    if (featured === 'true' || featured === true) {
      filter.isFeatured = true;
    }
    
    // Поиск по тексту
    if (search && search.trim().length > 0) {
      filter.$text = { $search: search.trim() };
    }
    
    // Фильтр видимости
    filter.isVisible = true;
    
    // Сортировка
    const sortOptions = {};
    const sortField = this.getSortField(sortBy);
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;
    
    // Пагинация
    const skip = (page - 1) * limit;
    
    try {
      // Запрос с безопасными опциями
      let queryBuilder = ProductModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean({ virtuals: true });
      
      // Безопасная популяция
      if (populate === 'category' || populate === 'all') {
        queryBuilder = queryBuilder.populate('category', 'name slug _id');
      }
      
      if (populate === 'relatedProducts' || populate === 'all') {
        queryBuilder = queryBuilder.populate('relatedProducts', 
          'title priceForIndividual mainImage status _id');
      }
      
      const [products, total] = await Promise.all([
        queryBuilder,
        ProductModel.countDocuments(filter)
      ]);
      
      // Рассчитываем финальные цены
      const productsWithFinalPrice = products.map(product => ({
        ...product,
        finalPriceForIndividual: this.calculateFinalPrice(product)
      }));
      
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
      throw ApiError.DatabaseError('Ошибка при получении продуктов');
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
  
  async createProduct(productData, userId) {
    try {
      // Проверка уникальности SKU
      const existingProduct = await ProductModel.findOne({ sku: productData.sku });
      if (existingProduct) {
        throw ApiError.Conflict('Продукт с таким SKU уже существует');
      }
      
      // Проверка существования категории
      const categoryExists = await CategoryModel.findById(productData.category);
      if (!categoryExists) {
        throw ApiError.BadRequest('Указанная категория не существует');
      }
      
      // Проверка связанных продуктов
      await this.validateRelatedProducts(productData);
      
      const product = new ProductModel({
        ...productData,
        createdBy: userId,
        updatedBy: userId
      });
      
      await product.save();
      
      return product.toObject({ virtuals: true });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при создании продукта');
    }
  }
  
  async updateProduct(id, updateData, userId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID продукта');
    }
    
    try {
      const product = await ProductModel.findById(id);
      if (!product) {
        throw ApiError.NotFound('Продукт не найден');
      }
      
      // Проверка SKU на уникальность
      if (updateData.sku && updateData.sku !== product.sku) {
        const existingProduct = await ProductModel.findOne({ 
          sku: updateData.sku,
          _id: { $ne: id }
        });
        if (existingProduct) {
          throw ApiError.Conflict('Продукт с таким SKU уже существует');
        }
      }
      
      // Проверка категории
      if (updateData.category) {
        const categoryExists = await CategoryModel.findById(updateData.category);
        if (!categoryExists) {
          throw ApiError.BadRequest('Указанная категория не существует');
        }
      }
      
      // Проверка связанных продуктов
      await this.validateRelatedProducts(updateData, id);
      
      // Обновление полей
      Object.keys(updateData).forEach(key => {
        product[key] = updateData[key];
      });
      
      product.updatedBy = userId;
      product.updatedAt = new Date();
      
      await product.save();
      
      return product.toObject({ virtuals: true });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при обновлении продукта');
    }
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
        throw ApiError.Conflict('Продукт уже связан');
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