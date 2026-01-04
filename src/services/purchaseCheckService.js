// services/purchaseCheckService.js или utils/purchaseChecker.js
const { OrderModel, OrderStatus } = require('../models/order-model');

class PurchaseCheckService {
  /**
   * Проверяет, покупал ли пользователь товар
   * @param {string} userId - ID пользователя
   * @param {string} productId - ID товара
   * @returns {Promise<boolean>} - true если покупал, false если нет
   */
  static async hasUserPurchasedProduct(userId, productId) {
    if (!userId || !productId) {
        console.log('SOSALLLL');
      return false;
    }

    try {
      const completedOrders = await OrderModel.exists({
        user: userId,
        status: {
          $in: [
            OrderStatus.DELIVERED,
            OrderStatus.READY_FOR_PICKUP,
            OrderStatus.SHIPPED 
          ]
        },
        'items.product': productId
      });

      return !!completedOrders;
    } catch (error) {
      console.error('Error checking user purchase:', error);
      return false;
    }
  }

  /**
   * Проверяет покупку товара по SKU
   * @param {string} userId - ID пользователя
   * @param {string} sku - SKU товара
   * @returns {Promise<boolean>} - true если покупал, false если нет
   */
  static async hasUserPurchasedProductBySku(userId, sku) {
    if (!userId || !sku) {
          console.log('SOSALLLL');
      return false;
    }

    try {
      const completedOrders = await OrderModel.exists({
        user: userId,
        status: {
          $in: [
            OrderStatus.DELIVERED,
            OrderStatus.READY_FOR_PICKUP
          ]
        },
        'items.sku': sku
      });

      return !!completedOrders;
    } catch (error) {
      console.error('Error checking user purchase by SKU:', error);
      return false;
    }
  }

  /**
   * Массовая проверка покупок нескольких товаров
   * @param {string} userId - ID пользователя
   * @param {Array<string>} productIds - массив ID товаров
   * @returns {Promise<Object>} - объект { [productId]: boolean }
   */
  static async hasUserPurchasedProducts(userId, productIds) {
    if (!userId || !Array.isArray(productIds) || productIds.length === 0) {
          console.log('SOSALLLL');
      return {};
    }

    try {
      const result = {};
      
      // Для каждого товара создаем обещание проверки
      const purchasePromises = productIds.map(async (productId) => {
        const hasPurchased = await this.hasUserPurchasedProduct(userId, productId);
        result[productId] = hasPurchased;
      });

      await Promise.all(purchasePromises);
      return result;
    } catch (error) {
      console.error('Error checking multiple purchases:', error);
      return productIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
    }
  }

  /**
   * Получает все завершенные заказы пользователя с конкретным товаром
   * @param {string} userId - ID пользователя
   * @param {string} productId - ID товара
   * @returns {Promise<Array>} - массив заказов
   */
  static async getUserOrdersWithProduct(userId, productId) {
    if (!userId || !productId) {
          console.log('SOSALLLL');
      return [];
    }

    try {
      const orders = await OrderModel.find({
        user: userId,
        status: {
          $in: [
            OrderStatus.DELIVERED,
            OrderStatus.READY_FOR_PICKUP
          ]
        },
        'items.product': productId
      })
      .select('orderNumber status createdAt items')
      .lean();

      return orders;
    } catch (error) {
      console.error('Error fetching user orders with product:', error);
      return [];
    }
  }
}

module.exports = PurchaseCheckService;