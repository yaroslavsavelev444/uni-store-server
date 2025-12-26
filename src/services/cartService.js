const ApiError = require("../exceptions/api-error");
const { CartModel, ProductModel } = require("../models/index.models");

class CartService {
  async getCart(userId) {
    if (!userId) {
      throw ApiError.BadRequest("ID пользователя обязателен");
    }

    const cart = await CartModel.findByUser(userId);
    
    if (!cart) {
      // Возвращаем пустую корзину, если её нет
      return {
        items: [],
        summary: {
          totalItems: 0,
          totalPrice: 0,
          totalDiscount: 0,
          itemsCount: 0
        },
        validation: {
          isValid: true,
          issues: []
        }
      };
    }

    // Фильтруем и обрабатываем товары
    const processedItems = [];
    let totalPrice = 0;
    let totalPriceWithoutDiscount = 0;
    let itemsToUpdate = false;
    const validationIssues = [];
    let isCartValid = true;

    for (const item of cart.items) {
      const product = item.product;
      
      // Если товар не найден или недоступен, пропускаем
      if (!product || !product.isVisible || !["available", "preorder"].includes(product.status)) {
        itemsToUpdate = true;
        continue;
      }

      // Проверка наличия
      const availableQuantity = Math.max(0, product.stockQuantity - product.reservedQuantity);
      if (availableQuantity === 0) {
        itemsToUpdate = true;
        continue;
      }

      // Корректировка количества, если превышает доступное
      let quantity = item.quantity;
      if (quantity > availableQuantity) {
        quantity = availableQuantity;
        itemsToUpdate = true;
      }

      // ВАЖНО: НЕ корректируем количество по минимальному заказу!
      // Просто проверяем и добавляем в validationIssues
      if (product.minOrderQuantity && quantity < product.minOrderQuantity) {
        validationIssues.push({
          productId: product._id,
          productTitle: product.title,
          currentQuantity: quantity,
          minOrderQuantity: product.minOrderQuantity,
          message: `Минимальное количество для заказа: ${product.minOrderQuantity}`
        });
        isCartValid = false;
      }

      // Проверка максимального количества
      if (product.maxOrderQuantity && quantity > product.maxOrderQuantity) {
        quantity = product.maxOrderQuantity;
        itemsToUpdate = true;
      }

      // Рассчитываем цены
      const price = product.priceForIndividual || 0;
      const finalPrice = product.finalPriceForIndividual || price;
      
      const itemTotal = price * quantity;
      const itemTotalWithDiscount = finalPrice * quantity;
      const itemDiscount = itemTotal - itemTotalWithDiscount;

      totalPriceWithoutDiscount += itemTotal;
      totalPrice += itemTotalWithDiscount;

      processedItems.push({
        product: {
          _id: product._id,
          title: product.title,
          sku: product.sku,
          price: price,
          finalPrice: finalPrice,
          availableQuantity: availableQuantity,
          minOrderQuantity: product.minOrderQuantity || 1, // По умолчанию 1
          maxOrderQuantity: product.maxOrderQuantity,
          mainImage: product.mainImage,
          status: product.status
        },
        quantity: quantity,
        addedAt: item.addedAt,
        subtotal: itemTotalWithDiscount,
        discount: itemDiscount
      });
    }

    // Обновляем корзину, если были изменения
    if (itemsToUpdate) {
      cart.items = processedItems.map(item => ({
        product: item.product._id,
        quantity: item.quantity,
        addedAt: item.addedAt
      }));
      await cart.save();
    }

    return {
      items: processedItems,
      summary: {
        totalItems: processedItems.reduce((sum, item) => sum + item.quantity, 0),
        totalPrice: Math.round(totalPrice * 100) / 100,
        totalDiscount: Math.round((totalPriceWithoutDiscount - totalPrice) * 100) / 100,
        itemsCount: processedItems.length
      },
      validation: {
        isValid: isCartValid,
        issues: validationIssues
      },
      cartId: cart._id,
      updatedAt: cart.updatedAt
    };
  }

  async addOrUpdateItem(userId, productId, quantity) {
    // Валидация входных данных
    if (!userId || !productId || quantity < 1) {
      throw ApiError.BadRequest("Некорректные данные");
    }

    // Проверяем существование товара
    const product = await ProductModel.findById(productId);
    if (!product) {
      throw ApiError.NotFoundError("Товар не найден");
    }

    // Проверяем доступность товара
    if (!product.isVisible || !["available", "preorder"].includes(product.status)) {
      throw ApiError.BadRequest("Товар недоступен для заказа");
    }

    // Проверяем наличие
    const availableQuantity = Math.max(0, product.stockQuantity - product.reservedQuantity);
    if (availableQuantity === 0) {
      throw ApiError.BadRequest("Товар отсутствует в наличии");
    }

    // Проверяем максимальное количество
    if (product.maxOrderQuantity && quantity > product.maxOrderQuantity) {
      throw ApiError.BadRequest(`Максимальное количество для заказа: ${product.maxOrderQuantity}`);
    }

    // Проверяем, не превышает ли количество доступное
    if (quantity > availableQuantity) {
      throw ApiError.BadRequest(`Доступно только ${availableQuantity} единиц товара`);
    }

    // Ищем или создаем корзину
    let cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      cart = new CartModel({ user: userId, items: [] });
    }

    // Ищем товар в корзине
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      // Добавляем новый товар
      cart.items.push({
        product: productId,
        quantity: quantity,
        addedAt: new Date()
      });
    } else {
      // Обновляем существующий товар
      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].addedAt = new Date();
    }

    await cart.save();
    
    // Возвращаем обновленную корзину
    return this.getCart(userId);
  }

  async removeItem(userId, productId) {
    if (!userId || !productId) {
      throw ApiError.BadRequest("Некорректные данные");
    }

    const cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      throw ApiError.NotFoundError("Корзина не найдена");
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      item => item.product.toString() !== productId.toString()
    );

    if (cart.items.length === initialLength) {
      throw ApiError.NotFoundError("Товар не найден в корзине");
    }

    await cart.save();
    return this.getCart(userId);
  }

  async decreaseQuantity(userId, productId) {
    if (!userId || !productId) {
      throw ApiError.BadRequest("Некорректные данные");
    }

    const cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      throw ApiError.NotFoundError("Корзина не найдена");
    }

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      throw ApiError.NotFoundError("Товар не найден в корзине");
    }

    const product = await ProductModel.findById(productId);
    if (!product) {
      throw ApiError.NotFoundError("Товар не найден");
    }

    // Уменьшаем количество на 1, но не ниже 1
    const newQuantity = cart.items[itemIndex].quantity - 1;
    
    if (newQuantity < 1) {
      // Удаляем товар, если количество стало меньше 1
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = newQuantity;
    }

    await cart.save();
    return this.getCart(userId);
  }

  async clearCart(userId) {
    if (!userId) {
      throw ApiError.BadRequest("ID пользователя обязателен");
    }

    const cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      throw ApiError.NotFoundError("Корзина не найдена");
    }

    cart.items = [];
    await cart.save();
    
    return {
      message: "Корзина очищена",
      cartId: cart._id
    };
  }

  async getCartSummary(userId) {
    const cart = await this.getCart(userId);
    return cart.summary;
  }
}

module.exports = new CartService();