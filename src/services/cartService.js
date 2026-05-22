const ApiError = require("../exceptions/api-error");
const { CartModel, ProductModel } = require("../models/index.models");
const fileService = require("../utils/fileManager");
const discountService = require("../services/discountService"); // Добавляем импорт

class CartService {
  async getCart(userId) {
    if (!userId) {
      throw ApiError.BadRequest("ID пользователя обязателен");
    }

    const cart = await CartModel.findByUser(userId);
    if (!cart) {
      return this.getEmptyCartResponse();
    }

    const processedItems = [];
    let totalPrice = 0;
    let totalPriceWithoutDiscount = 0;
    let itemsToUpdate = false;
    const validationIssues = [];
    let isCartValid = true;

    for (const item of cart.items) {
      const product = item.product;

      if (
        !product ||
        !product.isVisible ||
        !["available", "preorder"].includes(product.status)
      ) {
        itemsToUpdate = true;
        continue;
      }

      let quantity = item.quantity;

      if (product.minOrderQuantity && quantity < product.minOrderQuantity) {
        validationIssues.push({
          productId: product._id,
          productTitle: product.title,
          currentQuantity: quantity,
          minOrderQuantity: product.minOrderQuantity,
          message: `Минимальное количество для заказа: ${product.minOrderQuantity}`,
        });
        isCartValid = false;
      }

      if (product.maxOrderQuantity && quantity > product.maxOrderQuantity) {
        quantity = product.maxOrderQuantity;
        itemsToUpdate = true;
      }

      const price = product.priceForIndividual || 0;
      const finalPrice = product.finalPriceForIndividual || price;

      const itemTotal = this.roundMoney(price * quantity);
const itemTotalWithDiscount = this.roundMoney(finalPrice * quantity);
      const itemDiscount = this.roundMoney(itemTotal - itemTotalWithDiscount);

      totalPriceWithoutDiscount = this.roundMoney(totalPriceWithoutDiscount + itemTotal);
      totalPrice = this.roundMoney(totalPrice + itemTotalWithDiscount);

      let mainImage = null;
      if (product.images && product.images.length > 0) {
        const firstImage = product.images.sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        )[0];
        if (firstImage && firstImage.url) {
          mainImage = fileService.getFileUrl(firstImage.url);
        }
      }

      let processedImages = null;
      if (product.images && Array.isArray(product.images)) {
        processedImages = product.images
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((img) => {
            if (img && img.url) {
              return {
                ...img,
                url: fileService.getFileUrl(img.url),
              };
            }
            return img;
          });
      }

      processedItems.push({
        product: {
          _id: product._id,
          title: product.title,
          sku: product.sku,
          price: price,
          url: product.url,
          finalPrice: finalPrice,
          minOrderQuantity: product.minOrderQuantity || 1,
          maxOrderQuantity: product.maxOrderQuantity,
          mainImage: mainImage,
          images: processedImages,
          status: product.status,
          weight: product.weight || 0,
          ...(product.dimensions && { dimensions: product.dimensions }),
          ...(product.brand && { brand: product.brand }),
          ...(product.category && { category: product.category }),
          ...(product.description && { description: product.description }),
        },
        quantity: quantity,
        addedAt: item.addedAt,
        subtotal: itemTotalWithDiscount,
        discount: itemDiscount,
      });
    }

    if (itemsToUpdate) {
    cart.items = processedItems.map(i => ({ product: i.product._id, quantity: i.quantity, addedAt: i.addedAt }));
    await cart.save();
  }

   // === Расчёт централизованных скидок ===
  const cartDataForDiscounts = {
    items: processedItems,
    totalAmount: totalPrice,
    totalQuantity: processedItems.reduce((sum, i) => sum + i.quantity, 0)
  };

  const discountResult = await discountService.getApplicableDiscounts(cartDataForDiscounts);

  const appliedDiscount = discountResult.find(d => d.applicable);
  const centralDiscountAmount = appliedDiscount ? this.roundMoney(appliedDiscount.discountAmount) : 0;

  const finalTotalPrice = this.roundMoney(totalPrice - centralDiscountAmount);
  const totalDiscount = this.roundMoney((totalPriceWithoutDiscount - totalPrice) + centralDiscountAmount);

  return {
    items: processedItems,
    summary: {
      totalItems: processedItems.reduce((sum, i) => sum + i.quantity, 0),
      totalPrice: finalTotalPrice,
      totalDiscount: totalDiscount,
      itemsCount: processedItems.length,
      priceWithoutDiscount: totalPriceWithoutDiscount,
      productDiscountAmount: this.roundMoney(totalPriceWithoutDiscount - totalPrice),
      centralDiscountAmount: centralDiscountAmount,
      centralDiscountPercent: appliedDiscount ? appliedDiscount.discount.discountPercent : 0
    },
    validation: { isValid: isCartValid, issues: validationIssues },
    discounts: {
      applied: appliedDiscount ? [{
        _id: appliedDiscount.discount._id,
        name: appliedDiscount.discount.name,
        type: appliedDiscount.discount.type,
        discountPercent: appliedDiscount.discount.discountPercent,
        amount: centralDiscountAmount,
        message: appliedDiscount.message
      }] : [],
      available: [],
      hints: discountResult
        .filter(d => !d.applicable)
        .map(d => ({
          type: "hint",
          message: d.message,
          needed: d.needed,
          current: d.current
        }))
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
    if (
      !product.isVisible ||
      !["available", "preorder"].includes(product.status)
    ) {
      throw ApiError.BadRequest("Товар недоступен для заказа");
    }

    // Проверяем максимальное количество
    if (product.maxOrderQuantity && quantity > product.maxOrderQuantity) {
      throw ApiError.BadRequest(
        `Максимальное количество для заказа: ${product.maxOrderQuantity}`,
      );
    }

    // Ищем или создаем корзину
    let cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      cart = new CartModel({ user: userId, items: [] });
    }

    // Ищем товар в корзине
    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId.toString(),
    );

    if (itemIndex === -1) {
      // Добавляем новый товар
      cart.items.push({
        product: productId,
        quantity: quantity,
        addedAt: new Date(),
      });
    } else {
      // Обновляем существующий товар
      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].addedAt = new Date();
    }

    await cart.save();

    // Возвращаем обновленную корзину с пересчетом скидок
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
      (item) => item.product.toString() !== productId.toString(),
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
      (item) => item.product.toString() === productId.toString(),
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
      cartId: cart._id,
    };
  }

  async getCartSummary(userId) {
    const cart = await this.getCart(userId);
    return cart.summary;
  }

  /**
   * Получение расчетов скидок для корзины (для использования в других сервисах)
   */
  async calculateCartDiscounts(cartData) {
    return await discountService.getApplicableDiscounts(cartData);
  }
  // Добавь в класс:
  roundMoney(amount) {
    return Math.round(amount * 100) / 100;
  }

  getEmptyCartResponse() {
    return {
      items: [],
      summary: {
        totalItems: 0,
        totalPrice: 0,
        totalDiscount: 0,
        itemsCount: 0,
        priceWithoutDiscount: 0,
        centralDiscountAmount: 0,
        centralDiscountPercent: 0,
      },
      validation: {
        isValid: true,
        issues: [],
      },
      discounts: {
        applied: [],
        available: [],
        hints: [],
      },
    };
  }
}

module.exports = new CartService();
