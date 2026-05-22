// services/cache/order-cache.service.js
const redisClient = require('../redis/redis.client');
const logger = require('../logger/logger');

class OrderCacheService {
  constructor() {
    this.CACHE_PREFIX = 'order:';
    this.CACHE_TTL = 300; // 5 минут
    this.LISTS_TTL = 600; // 10 минут для списков
  }

  // Ключи кеша
  _getCacheKey(id) {
    return `${this.CACHE_PREFIX}${id}`;
  }

  _getUserOrdersKey(userId) {
    return `${this.CACHE_PREFIX}user:${userId}:orders`;
  }

  _getAdminOrdersKey(filter = 'all') {
    return `${this.CACHE_PREFIX}admin:orders:${filter}`;
  }

  // Очистка связанных кешей
  async invalidateUserCache(userId) {
    try {
      const userKey = this._getUserOrdersKey(userId);
      await redisClient.del(userKey);
      
      // Также удаляем все кешированные заказы этого пользователя
      const pattern = `${this.CACHE_PREFIX}*user:${userId}*`;
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (error) {
      logger.error(`[OrderCache] Ошибка инвалидации кеша пользователя ${userId}:`, error);
    }
  }

  async invalidateOrderCache(orderId) {
    try {
      const orderKey = this._getCacheKey(orderId);
      await redisClient.del(orderKey);
      
      // Инвалидируем кеши администратора
      const adminKeys = await redisClient.keys(`${this.CACHE_PREFIX}admin:orders:*`);
      if (adminKeys.length > 0) {
        await redisClient.del(...adminKeys);
      }
    } catch (error) {
      logger.error(`[OrderCache] Ошибка инвалидации кеша заказа ${orderId}:`, error);
    }
  }

  // Получение заказа с кешированием
  async getOrder(orderId) {
    try {
      const cacheKey = this._getCacheKey(orderId);
      const cached = await redisClient.getJson(cacheKey);
      
      if (cached) {
        logger.debug(`[OrderCache] Заказ ${orderId} получен из кеша`);
        return cached;
      }
      
      return null;
    } catch (error) {
      logger.error(`[OrderCache] Ошибка получения заказа ${orderId} из кеша:`, error);
      return null;
    }
  }

  // Сохранение заказа в кеш
  async setOrder(order) {
    try {
      if (!order || !order._id) return;
      
      const cacheKey = this._getCacheKey(order._id.toString());
      await redisClient.setJson(cacheKey, order, this.CACHE_TTL);
      logger.debug(`[OrderCache] Заказ ${order._id} сохранен в кеш`);
    } catch (error) {
      logger.error(`[OrderCache] Ошибка сохранения заказа в кеш:`, error);
    }
  }

  // Кеширование списка заказов пользователя
  async getUserOrders(userId, status = null) {
    try {
      const cacheKey = this._getUserOrdersKey(userId) + (status ? `:${status}` : '');
      const cached = await redisClient.getJson(cacheKey);
      
      if (cached) {
        logger.debug(`[OrderCache] Список заказов пользователя ${userId} получен из кеша`);
        return cached;
      }
      
      return null;
    } catch (error) {
      logger.error(`[OrderCache] Ошибка получения списка заказов пользователя ${userId}:`, error);
      return null;
    }
  }

  async setUserOrders(userId, orders, status = null) {
    try {
      const cacheKey = this._getUserOrdersKey(userId) + (status ? `:${status}` : '');
      await redisClient.setJson(cacheKey, orders, this.LISTS_TTL);
      logger.debug(`[OrderCache] Список заказов пользователя ${userId} сохранен в кеш`);
    } catch (error) {
      logger.error(`[OrderCache] Ошибка сохранения списка заказов пользователя ${userId}:`, error);
    }
  }

  // Кеширование списка заказов для администратора
  async getAdminOrders(filter = {}) {
    try {
      const filterKey = JSON.stringify(filter);
      const cacheKey = this._getAdminOrdersKey(filterKey);
      const cached = await redisClient.getJson(cacheKey);
      
      if (cached) {
        logger.debug(`[OrderCache] Список заказов админа получен из кеша`);
        return cached;
      }
      
      return null;
    } catch (error) {
      logger.error(`[OrderCache] Ошибка получения списка заказов админа:`, error);
      return null;
    }
  }

  async setAdminOrders(filter, orders) {
    try {
      const filterKey = JSON.stringify(filter);
      const cacheKey = this._getAdminOrdersKey(filterKey);
      await redisClient.setJson(cacheKey, orders, this.LISTS_TTL);
      logger.debug(`[OrderCache] Список заказов админа сохранен в кеш`);
    } catch (error) {
      logger.error(`[OrderCache] Ошибка сохранения списка заказов админа:`, error);
    }
  }
}

module.exports = new OrderCacheService();