// services/cache/order-cache.service.js

import { error as _error, debug } from "../logger/logger";
import { keys as _keys, del, getJson, setJson } from "../redis/redis.client";

class OrderCacheService {
  constructor() {
    this.CACHE_PREFIX = "order:";
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

  _getAdminOrdersKey(filter = "all") {
    return `${this.CACHE_PREFIX}admin:orders:${filter}`;
  }

  // Очистка связанных кешей
  async invalidateUserCache(userId) {
    try {
      const userKey = this._getUserOrdersKey(userId);
      await del(userKey);

      // Также удаляем все кешированные заказы этого пользователя
      const pattern = `${this.CACHE_PREFIX}*user:${userId}*`;
      const keys = await _keys(pattern);
      if (keys.length > 0) {
        await del(...keys);
      }
    } catch (error) {
      _error(
        `[OrderCache] Ошибка инвалидации кеша пользователя ${userId}:`,
        error,
      );
    }
  }

  async invalidateOrderCache(orderId) {
    try {
      const orderKey = this._getCacheKey(orderId);
      await del(orderKey);

      // Инвалидируем кеши администратора
      const adminKeys = await _keys(`${this.CACHE_PREFIX}admin:orders:*`);
      if (adminKeys.length > 0) {
        await del(...adminKeys);
      }
    } catch (error) {
      _error(`[OrderCache] Ошибка инвалидации кеша заказа ${orderId}:`, error);
    }
  }

  // Получение заказа с кешированием
  async getOrder(orderId) {
    try {
      const cacheKey = this._getCacheKey(orderId);
      const cached = await getJson(cacheKey);

      if (cached) {
        debug(`[OrderCache] Заказ ${orderId} получен из кеша`);
        return cached;
      }

      return null;
    } catch (error) {
      _error(`[OrderCache] Ошибка получения заказа ${orderId} из кеша:`, error);
      return null;
    }
  }

  // Сохранение заказа в кеш
  async setOrder(order) {
    try {
      if (!order || !order._id) return;

      const cacheKey = this._getCacheKey(order._id.toString());
      await setJson(cacheKey, order, this.CACHE_TTL);
      debug(`[OrderCache] Заказ ${order._id} сохранен в кеш`);
    } catch (error) {
      _error(`[OrderCache] Ошибка сохранения заказа в кеш:`, error);
    }
  }

  // Кеширование списка заказов пользователя
  async getUserOrders(userId, status = null) {
    try {
      const cacheKey =
        this._getUserOrdersKey(userId) + (status ? `:${status}` : "");
      const cached = await getJson(cacheKey);

      if (cached) {
        debug(
          `[OrderCache] Список заказов пользователя ${userId} получен из кеша`,
        );
        return cached;
      }

      return null;
    } catch (error) {
      _error(
        `[OrderCache] Ошибка получения списка заказов пользователя ${userId}:`,
        error,
      );
      return null;
    }
  }

  async setUserOrders(userId, orders, status = null) {
    try {
      const cacheKey =
        this._getUserOrdersKey(userId) + (status ? `:${status}` : "");
      await setJson(cacheKey, orders, this.LISTS_TTL);
      debug(
        `[OrderCache] Список заказов пользователя ${userId} сохранен в кеш`,
      );
    } catch (error) {
      _error(
        `[OrderCache] Ошибка сохранения списка заказов пользователя ${userId}:`,
        error,
      );
    }
  }

  // Кеширование списка заказов для администратора
  async getAdminOrders(filter = {}) {
    try {
      const filterKey = JSON.stringify(filter);
      const cacheKey = this._getAdminOrdersKey(filterKey);
      const cached = await getJson(cacheKey);

      if (cached) {
        debug(`[OrderCache] Список заказов админа получен из кеша`);
        return cached;
      }

      return null;
    } catch (error) {
      _error(`[OrderCache] Ошибка получения списка заказов админа:`, error);
      return null;
    }
  }

  async setAdminOrders(filter, orders) {
    try {
      const filterKey = JSON.stringify(filter);
      const cacheKey = this._getAdminOrdersKey(filterKey);
      await setJson(cacheKey, orders, this.LISTS_TTL);
      debug(`[OrderCache] Список заказов админа сохранен в кеш`);
    } catch (error) {
      _error(`[OrderCache] Ошибка сохранения списка заказов админа:`, error);
    }
  }
}

export default new OrderCacheService();
