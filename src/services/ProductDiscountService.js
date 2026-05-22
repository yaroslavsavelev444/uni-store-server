// services/productDiscountService.js
const { DiscountModel } = require("../models/index.models");
const ApiError = require("../exceptions/api-error");

class ProductDiscountService {
  /**
   * Получение активных скидок для конкретного товара
   */
  async getActiveDiscountsForProduct(product) {
    try {
      const now = new Date();
      
      // Получаем все активные скидки
      const discounts = await DiscountModel.find({
        isActive: true,
        startAt: { $lte: now },
        $or: [
          { isUnlimited: true },
          { endAt: null },
          { endAt: { $gte: now } }
        ]
      }).sort({ priority: 1, createdAt: -1 });
      
      // Фильтруем скидки, которые применимы к этому товару
      const applicableDiscounts = discounts.filter(discount => 
        discount.isApplicableToProduct(product)
      );
      
      // Преобразуем в нужный формат
      return applicableDiscounts.map(discount => ({
        _id: discount._id,
        name: discount.name,
        type: discount.type,
        discountPercent: discount.discountPercent,
        minTotalQuantity: discount.minTotalQuantity,
        appliesToAllProducts: discount.appliesToAllProducts,
        applicableCategories: discount.applicableCategories,
        applicableProducts: discount.applicableProducts,
        isCurrentlyActive: discount.isCurrentlyActive,
        message: this.generateDiscountMessage(discount)
      }));
    } catch (error) {
      console.error("[PRODUCT_DISCOUNT_SERVICE] Ошибка получения скидок для товара:", error);
      return [];
    }
  }

  /**
   * Генерация сообщения о скидке
   */
  generateDiscountMessage(discount) {
    switch (discount.type) {
      case "quantity_based":
        return `Скидка ${discount.discountPercent}% при покупке от ${discount.minTotalQuantity} товаров`;
      case "amount_based":
        return `Скидка ${discount.discountPercent}% при заказе от ${discount.minOrderAmount} ₽`;
      default:
        return `Скидка ${discount.discountPercent}%`;
    }
  }

  /**
   * Проверка, доступна ли скидка на корзину для товара
   */
  async getCartDiscountInfoForProduct(product, cartQuantity = 1) {
    try {
      const discounts = await this.getActiveDiscountsForProduct(product);
      
      if (discounts.length === 0) {
        return null;
      }
      
      // Для quantity_based скидок считаем, сколько нужно добавить товаров
      const quantityDiscount = discounts.find(d => d.type === "quantity_based");
      
      if (quantityDiscount) {
        const needed = Math.max(0, quantityDiscount.minTotalQuantity - cartQuantity);
        
        return {
          hasDiscount: true,
          discountType: "quantity_based",
          discountPercent: quantityDiscount.discountPercent,
          minTotalQuantity: quantityDiscount.minTotalQuantity,
          currentQuantity: cartQuantity,
          neededQuantity: needed,
          message: needed > 0 
            ? `Добавьте ещё ${needed} товаров для получения скидки ${quantityDiscount.discountPercent}%`
            : `Скидка ${quantityDiscount.discountPercent}% доступна при покупке от ${quantityDiscount.minTotalQuantity} товаров`,
          discount: quantityDiscount
        };
      }
      
      // Если есть другие типы скидок, возвращаем первую
      return {
        hasDiscount: true,
        discountType: discounts[0].type,
        discountPercent: discounts[0].discountPercent,
        message: discounts[0].message,
        discount: discounts[0]
      };
    } catch (error) {
      console.error("[PRODUCT_DISCOUNT_SERVICE] Ошибка получения информации о скидке:", error);
      return null;
    }
  }

  /**
   * Получение скидок для списка товаров (оптимизированно)
   */
  async getDiscountsForProducts(products) {
    try {
      const now = new Date();
      
      // Получаем все активные скидки
      const discounts = await DiscountModel.find({
        isActive: true,
        startAt: { $lte: now },
        $or: [
          { isUnlimited: true },
          { endAt: null },
          { endAt: { $gte: now } }
        ]
      }).sort({ priority: 1, createdAt: -1 });
      
      // Для каждого товара определяем применимые скидки
      return products.map(product => {
        const applicableDiscounts = discounts.filter(discount => 
          discount.isApplicableToProduct(product)
        );
        
        const productWithDiscount = { ...product };
        
        if (applicableDiscounts.length > 0) {
          // Добавляем информацию о скидках
          productWithDiscount.centralDiscounts = applicableDiscounts.map(discount => ({
            _id: discount._id,
            name: discount.name,
            type: discount.type,
            discountPercent: discount.discountPercent,
            minTotalQuantity: discount.minTotalQuantity,
            minOrderAmount: discount.minOrderAmount,
            message: this.generateDiscountMessage(discount)
          }));
          
          // Основная скидка (первая по приоритету)
          productWithDiscount.centralDiscount = {
            ...productWithDiscount.centralDiscounts[0],
            hasDiscount: true
          };
        }
        
        return productWithDiscount;
      });
    } catch (error) {
      console.error("[PRODUCT_DISCOUNT_SERVICE] Ошибка получения скидок для товаров:", error);
      return products; // Возвращаем оригинальные товары в случае ошибки
    }
  }
}

module.exports = new ProductDiscountService();