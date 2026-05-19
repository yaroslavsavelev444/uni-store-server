// services/purchaseCheckService.ts

import type { Types } from "mongoose";
import { OrderModel, OrderStatus } from "../models/index.models.js";

/**
 * Сервис для проверки факта покупки товаров пользователем.
 * Все методы статические, возвращают безопасные значения при ошибках.
 */
export default class PurchaseCheckService {
  /**
   * Проверяет, покупал ли пользователь хотя бы один товар (любой) с учётом статусов заказа.
   * @param userId - ID пользователя
   * @param _productId - ID товара (не используется в запросе, оставлен для совместимости)
   * @returns true, если есть завершённый заказ, иначе false
   */
  static async hasUserPurchasedProduct(
    userId: string | Types.ObjectId,
    _productId?: string | Types.ObjectId,
  ): Promise<boolean> {
    if (!userId) {
      return false;
    }

    try {
      const completedOrderExists = await OrderModel.exists({
        user: userId,
        status: {
          $in: [
            OrderStatus.DELIVERED,
            OrderStatus.READY_FOR_PICKUP,
            OrderStatus.SHIPPED,
          ],
        },
      });
      return !!completedOrderExists;
    } catch (error) {
      console.error("Error checking user purchase:", error);
      return false;
    }
  }

  /**
   * Проверяет, покупал ли пользователь товар с конкретным SKU.
   * @param userId - ID пользователя
   * @param sku - SKU товара
   * @returns true, если есть заказ с таким SKU, иначе false
   */
  static async hasUserPurchasedProductBySku(
    userId: string | Types.ObjectId,
    sku: string,
  ): Promise<boolean> {
    if (!userId || !sku) {
      return false;
    }

    try {
      const completedOrderExists = await OrderModel.exists({
        user: userId,
        status: {
          $in: [OrderStatus.DELIVERED, OrderStatus.READY_FOR_PICKUP],
        },
        "items.sku": sku,
      });
      return !!completedOrderExists;
    } catch (error) {
      console.error("Error checking user purchase by SKU:", error);
      return false;
    }
  }

  /**
   * Массовая проверка покупок нескольких товаров (по ID товара, но сам productId не используется – см. hasUserPurchasedProduct).
   * @param userId - ID пользователя
   * @param productIds - массив ID товаров
   * @returns объект { [productId]: boolean }
   */
  static async hasUserPurchasedProducts(
    userId: string | Types.ObjectId,
    productIds: (string | Types.ObjectId)[],
  ): Promise<Record<string, boolean>> {
    if (!userId || !Array.isArray(productIds) || productIds.length === 0) {
      console.log("SOSALLLL");
      return {};
    }

    try {
      const result: Record<string, boolean> = {};
      const purchasePromises = productIds.map(async (productId) => {
        const hasPurchased = await PurchaseCheckService.hasUserPurchasedProduct(
          userId,
          productId,
        );
        result[String(productId)] = hasPurchased;
      });
      await Promise.all(purchasePromises);
      return result;
    } catch (error) {
      console.error("Error checking multiple purchases:", error);
      return productIds.reduce(
        (acc, id) => ({ ...acc, [String(id)]: false }),
        {},
      );
    }
  }

  /**
   * Получает все завершённые заказы пользователя, содержащие указанный товар (по productId).
   * @param userId - ID пользователя
   * @param productId - ID товара
   * @returns массив заказов (lean-объекты)
   */
  static async getUserOrdersWithProduct(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<Array<Record<string, unknown>>> {
    if (!userId || !productId) {
      console.log("SOSALLLL");
      return [];
    }

    try {
      const orders = await OrderModel.find({
        user: userId,
        status: {
          $in: [OrderStatus.DELIVERED, OrderStatus.READY_FOR_PICKUP],
        },
        "items.product": productId,
      })
        .select("orderNumber status createdAt items")
        .lean();
      return orders;
    } catch (error) {
      console.error("Error fetching user orders with product:", error);
      return [];
    }
  }
}
