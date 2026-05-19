// services/productDiscountService.ts
import type { Types } from "mongoose";
import { DiscountModel } from "../models/index.models.js";
import type { IDiscount, IDiscountDocument } from "../types/discount.types.js";

// ========== Локальные типы ==========
/**
 * Минимальный интерфейс продукта, достаточный для проверки применимости скидки.
 */
export interface IProductForDiscount {
  _id: Types.ObjectId;
  category?: Types.ObjectId;
  [key: string]: unknown;
}

/**
 * Информация о скидке для товара (без вычисления корзины).
 */
export interface DiscountInfo {
  _id: Types.ObjectId;
  name: string;
  type: IDiscount["type"];
  discountPercent: number;
  minTotalQuantity?: number;
  appliesToAllProducts: boolean;
  applicableCategories: Types.ObjectId[];
  applicableProducts: Types.ObjectId[];
  isCurrentlyActive: boolean;
  message: string;
}

/**
 * Информация о скидке для товара с учётом корзины.
 */
export interface CartDiscountInfo {
  hasDiscount: true;
  discountType: IDiscount["type"];
  discountPercent: number;
  minTotalQuantity?: number;
  currentQuantity?: number;
  neededQuantity?: number;
  message: string;
  discount: DiscountInfo;
}

/**
 * Товар с добавленными централизованными скидками.
 */
export interface ProductWithDiscount extends IProductForDiscount {
  centralDiscounts?: DiscountInfo[];
  centralDiscount?: DiscountInfo & { hasDiscount: boolean };
}

class ProductDiscountService {
  /**
   * Получение активных скидок для конкретного товара
   */
  async getActiveDiscountsForProduct(
    product: IProductForDiscount,
  ): Promise<DiscountInfo[]> {
    try {
      const now = new Date();

      const discounts = await DiscountModel.find({
        isActive: true,
        startAt: { $lte: now },
        $or: [{ isUnlimited: true }, { endAt: null }, { endAt: { $gte: now } }],
      }).sort({ priority: 1, createdAt: -1 });

      const applicableDiscounts = discounts.filter((discount) =>
        discount.isApplicableToProduct(product),
      );

      return applicableDiscounts.map((discount) => ({
        _id: discount._id,
        name: discount.name,
        type: discount.type,
        discountPercent: discount.discountPercent,
        minTotalQuantity: discount.minTotalQuantity,
        appliesToAllProducts: discount.appliesToAllProducts,
        applicableCategories: discount.applicableCategories,
        applicableProducts: discount.applicableProducts,
        isCurrentlyActive: discount.isCurrentlyActive,
        message: this.generateDiscountMessage(discount),
      }));
    } catch (error) {
      console.error(
        "[PRODUCT_DISCOUNT_SERVICE] Ошибка получения скидок для товара:",
        error,
      );
      return [];
    }
  }

  /**
   * Генерация сообщения о скидке
   */
  generateDiscountMessage(discount: IDiscountDocument): string {
    switch (discount.type) {
      case "quantity_based":
        return `Скидка ${discount.discountPercent}% при покупке от ${discount.minTotalQuantity} товаров`;
      case "amount_based": // в модели поле называется minTotalAmount
        return `Скидка ${discount.discountPercent}% при заказе от ${discount.minTotalAmount} ₽`;
      default:
        return `Скидка ${discount.discountPercent}%`;
    }
  }

  /**
   * Проверка, доступна ли скидка на корзину для товара
   */
  async getCartDiscountInfoForProduct(
    product: IProductForDiscount,
    cartQuantity = 1,
  ): Promise<CartDiscountInfo | null> {
    try {
      const discounts = await this.getActiveDiscountsForProduct(product);

      if (discounts.length === 0) {
        return null;
      }

      const quantityDiscount = discounts.find(
        (d) => d.type === "quantity_based",
      );

      if (quantityDiscount) {
        const minQty = quantityDiscount.minTotalQuantity ?? 0;
        const needed = Math.max(0, minQty - cartQuantity);

        return {
          hasDiscount: true,
          discountType: "quantity_based",
          discountPercent: quantityDiscount.discountPercent,
          minTotalQuantity: minQty,
          currentQuantity: cartQuantity,
          neededQuantity: needed,
          message:
            needed > 0
              ? `Добавьте ещё ${needed} товаров для получения скидки ${quantityDiscount.discountPercent}%`
              : `Скидка ${quantityDiscount.discountPercent}% доступна при покупке от ${minQty} товаров`,
          discount: quantityDiscount,
        };
      }

      // Если есть другие типы скидок, возвращаем первую
      const first = discounts[0];
      return {
        hasDiscount: true,
        discountType: first.type,
        discountPercent: first.discountPercent,
        message: first.message,
        discount: first,
      };
    } catch (error) {
      console.error(
        "[PRODUCT_DISCOUNT_SERVICE] Ошибка получения информации о скидке:",
        error,
      );
      return null;
    }
  }

  /**
   * Получение скидок для списка товаров (оптимизированно)
   */
  async getDiscountsForProducts(
    products: IProductForDiscount[],
  ): Promise<ProductWithDiscount[]> {
    try {
      const now = new Date();

      const discounts = await DiscountModel.find({
        isActive: true,
        startAt: { $lte: now },
        $or: [{ isUnlimited: true }, { endAt: null }, { endAt: { $gte: now } }],
      }).sort({ priority: 1, createdAt: -1 });

      return products.map((product) => {
        const applicableDiscounts = discounts.filter((discount) =>
          discount.isApplicableToProduct(product),
        );

        const productWithDiscount: ProductWithDiscount = { ...product };

        if (applicableDiscounts.length) {
          const discountInfos: DiscountInfo[] = applicableDiscounts.map(
            (discount) => ({
              _id: discount._id,
              name: discount.name,
              type: discount.type,
              discountPercent: discount.discountPercent,
              minTotalQuantity: discount.minTotalQuantity,
              appliesToAllProducts: discount.appliesToAllProducts,
              applicableCategories: discount.applicableCategories,
              applicableProducts: discount.applicableProducts,
              isCurrentlyActive: discount.isCurrentlyActive,
              message: this.generateDiscountMessage(discount),
            }),
          );

          productWithDiscount.centralDiscounts = discountInfos;
          productWithDiscount.centralDiscount = {
            ...discountInfos[0],
            hasDiscount: true,
          };
        }

        return productWithDiscount;
      });
    } catch (error) {
      console.error(
        "[PRODUCT_DISCOUNT_SERVICE] Ошибка получения скидок для товаров:",
        error,
      );
      return products; // Возвращаем оригинальные товары в случае ошибки
    }
  }
}

export default new ProductDiscountService();
