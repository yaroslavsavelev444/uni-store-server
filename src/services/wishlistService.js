const ApiError = require("../exceptions/api-error");
const { WishlistModel, ProductModel } = require("../models/index.models");

class WishlistService {
  /**
   * Получить избранное пользователя в формате простых продуктов
   */
  async getWishlist(userId) {
    if (!userId) {
      throw ApiError.BadRequest("ID пользователя обязателен");
    }

    const wishlist = await WishlistModel.findByUser(userId);
    
    if (!wishlist || wishlist.items.length === 0) {
      // Возвращаем пустой массив продуктов
      return [];
    }

    // Собираем ID продуктов из избранного
    const productIds = wishlist.items
      .filter(item => item.product) // Фильтруем только существующие товары
      .map(item => item.product._id);

    if (productIds.length === 0) {
      return [];
    }

    // Получаем продукты в том же формате, что и обычный список товаров
    const products = await ProductModel.find({
      _id: { $in: productIds },
      isVisible: true // Только видимые товары
    })
    .select("-__v -createdBy -updatedBy -priceHistory -customAttributes")
    .populate('category', 'name slug')
    .lean({ virtuals: true });

    // Добавляем дату добавления в избранное
    const productsWithAddedAt = products.map(product => {
      const wishlistItem = wishlist.items.find(item => 
        item.product && item.product._id.toString() === product._id.toString()
      );
      
      return {
        ...product,
        addedToWishlistAt: wishlistItem?.addedAt || new Date(),
        wishlistNotes: wishlistItem?.notes || "",
        // Вычисляем финальную цену
        finalPriceForIndividual: this.calculateFinalPrice(product)
      };
    });

    // Сортируем по дате добавления в избранное (новые сверху)
    productsWithAddedAt.sort((a, b) => 
      new Date(b.addedToWishlistAt) - new Date(a.addedToWishlistAt)
    );

    return productsWithAddedAt;
  }

  /**
   * Добавить товар в избранное
   */
  async addProduct(userId, productId, notes = "") {
    if (!userId || !productId) {
      throw ApiError.BadRequest("ID пользователя и товара обязательны");
    }

    // Проверяем существование товара
    const product = await ProductModel.findById(productId);
    if (!product) {
      throw ApiError.NotFoundError("Товар не найден");
    }

    // Проверяем видимость товара
    if (!product.isVisible) {
      throw ApiError.BadRequest("Товар недоступен для добавления в избранное");
    }

    // Ищем или создаем вишлист
    let wishlist = await WishlistModel.findOne({ user: userId });
    if (!wishlist) {
      wishlist = new WishlistModel({ 
        user: userId, 
        items: [],
        settings: {
          notifyOnPriceDrop: true,
          notifyOnRestock: true,
          sortBy: "addedAt"
        }
      });
    }

    // Проверяем, есть ли уже товар в избранном
    const existingItem = wishlist.items.find(item => 
      item.product.toString() === productId.toString()
    );

    if (existingItem) {
      // Если уже есть, обновляем заметки если нужно
      if (notes && notes !== existingItem.notes) {
        existingItem.notes = notes;
        existingItem.addedAt = new Date();
        await wishlist.save();
      }
      return this.getWishlist(userId); // Возвращаем обновленный список
    }

    // Добавляем новый товар
    wishlist.items.push({
      product: productId,
      addedAt: new Date(),
      notes: notes
    });
    
    await wishlist.save();
    return this.getWishlist(userId);
  }

  /**
   * Удалить товар из избранного
   */
  async removeProduct(userId, productId) {
    if (!userId || !productId) {
      throw ApiError.BadRequest("ID пользователя и товара обязательны");
    }

    const wishlist = await WishlistModel.findOne({ user: userId });
    if (!wishlist) {
      throw ApiError.NotFoundError("Избранное не найдено");
    }

    const initialLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter(item => 
      item.product.toString() !== productId.toString()
    );

    if (wishlist.items.length === initialLength) {
      throw ApiError.NotFoundError("Товар не найден в избранном");
    }

    await wishlist.save();
    return this.getWishlist(userId);
  }

  /**
   * Переключить товар (добавить/удалить)
   */
  async toggleProduct(userId, productId, notes = "") {
    const wishlist = await WishlistModel.findOne({ user: userId });
    const exists = wishlist?.items.some(item => 
      item.product.toString() === productId.toString()
    );

    if (exists) {
      return await this.removeProduct(userId, productId);
    } else {
      return await this.addProduct(userId, productId, notes);
    }
  }

  /**
   * Очистить избранное
   */
  async clearWishlist(userId) {
    if (!userId) {
      throw ApiError.BadRequest("ID пользователя обязателен");
    }

    const wishlist = await WishlistModel.findOne({ user: userId });
    if (!wishlist) {
      throw ApiError.NotFoundError("Избранное не найдено");
    }

    wishlist.items = [];
    await wishlist.save();
    
    return [];
  }

  /**
   * Получить сводку избранного
   */
  async getWishlistSummary(userId) {
    const wishlistProducts = await this.getWishlist(userId);
    
    const summary = {
      totalItems: wishlistProducts.length,
      totalAvailable: 0,
      totalUnavailable: 0,
      totalPreorder: 0,
      hasPriceDrops: false,
      totalPrice: 0,
      totalDiscount: 0
    };

    wishlistProducts.forEach(product => {
      // Считаем доступные/недоступные
      const isAvailable = product.status === "available";
      const isPreorder = product.status === "preorder";
      
      if (isAvailable) summary.totalAvailable++;
      if (isPreorder) summary.totalPreorder++;
      if (!isAvailable && !isPreorder) summary.totalUnavailable++;

      // Считаем общую стоимость
      summary.totalPrice += product.finalPriceForIndividual || product.priceForIndividual;
      
      // Проверяем скидки
      if (product.discount?.isActive) {
        summary.hasPriceDrops = true;
        const discountAmount = product.priceForIndividual - (product.finalPriceForIndividual || product.priceForIndividual);
        summary.totalDiscount += discountAmount;
      }
    });

    return summary;
  }

  /**
   * Проверить, есть ли товар в избранном
   */
  async isInWishlist(userId, productId) {
    if (!userId || !productId) {
      return false;
    }

    const wishlist = await WishlistModel.findOne({ 
      user: userId,
      'items.product': productId 
    }).select('items.product');

    return !!wishlist;
  }

  /**
   * Получить ID всех товаров в избранном
   */
  async getWishlistProductIds(userId) {
    if (!userId) {
      return [];
    }

    const wishlist = await WishlistModel.findOne({ user: userId })
      .select('items.product')
      .lean();

    if (!wishlist || !wishlist.items) {
      return [];
    }

    return wishlist.items
      .filter(item => item.product)
      .map(item => item.product.toString());
  }

  /**
   * Получить количество товаров в избранном
   */
  async getWishlistCount(userId) {
    if (!userId) {
      return 0;
    }

    const wishlist = await WishlistModel.findOne({ user: userId })
      .select('items')
      .lean();

    return wishlist?.items?.length || 0;
  }

  /**
   * Получить товары в избранном с пагинацией
   */
  async getWishlistPaginated(userId, options = {}) {
    if (!userId) {
      return {
        products: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          pages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
    }

    const { page = 1, limit = 20, sortBy = 'addedAt', sortOrder = 'desc' } = options;

    const wishlist = await WishlistModel.findByUser(userId);
    
    if (!wishlist || wishlist.items.length === 0) {
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

    // Собираем ID продуктов
    const productIds = wishlist.items
      .filter(item => item.product)
      .map(item => item.product._id);

    const skip = (page - 1) * limit;

    // Получаем товары с пагинацией
    const [products, total] = await Promise.all([
      ProductModel.find({
        _id: { $in: productIds },
        isVisible: true
      })
      .select("-__v -createdBy -updatedBy -priceHistory -customAttributes")
      .populate('category', 'name slug')
      .sort(this.getSortOptions(sortBy, sortOrder))
      .skip(skip)
      .limit(parseInt(limit))
      .lean({ virtuals: true }),
      
      ProductModel.countDocuments({
        _id: { $in: productIds },
        isVisible: true
      })
    ]);

    // Добавляем дату добавления в избранное
    const productsWithAddedAt = products.map(product => {
      const wishlistItem = wishlist.items.find(item => 
        item.product && item.product._id.toString() === product._id.toString()
      );
      
      return {
        ...product,
        finalPriceForIndividual: this.calculateFinalPrice(product),
        addedToWishlistAt: wishlistItem?.addedAt || new Date(),
        wishlistNotes: wishlistItem?.notes || ""
      };
    });

    return {
      products: productsWithAddedAt,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  // Вспомогательные методы

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

  getSortOptions(sortBy, sortOrder) {
    const order = sortOrder === 'asc' ? 1 : -1;
    
    switch (sortBy) {
      case 'price':
        return { priceForIndividual: order };
      case 'name':
        return { title: order };
      case 'addedAt':
        return { addedToWishlistAt: order };
      case 'popularity':
        return { viewsCount: order };
      default:
        return { addedToWishlistAt: -1 };
    }
  }
}

module.exports = new WishlistService();