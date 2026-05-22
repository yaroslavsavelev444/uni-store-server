// services/cache/order-cache.service.ts
import type { Types } from "mongoose";
import logger from "../logger/logger.js";
import redisClient from "../redis/redis.client.js";

// ========== Типы Redis ==========
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl: number): Promise<void>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

// ========== Типы для заказа и фильтров ==========
// Если IOrder уже определён в проекте, используем его
// Здесь для примера определим минимальный интерфейс
export interface OrderCacheData {
  _id: Types.ObjectId | string;
  [key: string]: unknown;
}

export type OrderStatusFilter = string | null;

export interface AdminOrdersFilter {
  [key: string]: unknown;
}

class OrderCacheService {
  private readonly CACHE_PREFIX = "order:";
  private readonly CACHE_TTL = 300; // 5 минут
  private readonly LISTS_TTL = 600; // 10 минут для списков

  private _getCacheKey(id: string): string {
    return `${this.CACHE_PREFIX}${id}`;
  }

  private _getUserOrdersKey(userId: string): string {
    return `${this.CACHE_PREFIX}user:${userId}:orders`;
  }

  private _getAdminOrdersKey(filterKey: string): string {
    return `${this.CACHE_PREFIX}admin:orders:${filterKey}`;
  }

  async invalidateUserCache(userId: string): Promise<void> {
    try {
      const userKey = this._getUserOrdersKey(userId);
      await typedRedis.del(userKey);

      const pattern = `${this.CACHE_PREFIX}*user:${userId}*`;
      const keys = await typedRedis.keys(pattern);
      if (keys.length) {
        await typedRedis.del(...keys);
      }
    } catch (error) {
      logger.error(
        `[OrderCache] Ошибка инвалидации кеша пользователя ${userId}:`,
        error,
      );
    }
  }

  async invalidateOrderCache(orderId: string): Promise<void> {
    try {
      const orderKey = this._getCacheKey(orderId);
      await typedRedis.del(orderKey);

      const adminKeys = await typedRedis.keys(
        `${this.CACHE_PREFIX}admin:orders:*`,
      );
      if (adminKeys.length) {
        await typedRedis.del(...adminKeys);
      }
    } catch (error) {
      logger.error(
        `[OrderCache] Ошибка инвалидации кеша заказа ${orderId}:`,
        error,
      );
    }
  }

  async getOrder(orderId: string): Promise<OrderCacheData | null> {
    try {
      const cacheKey = this._getCacheKey(orderId);
      const cached = await typedRedis.getJson<OrderCacheData>(cacheKey);
      if (cached) {
        logger.debug(`[OrderCache] Заказ ${orderId} получен из кеша`);
        return cached;
      }
      return null;
    } catch (error) {
      logger.error(
        `[OrderCache] Ошибка получения заказа ${orderId} из кеша:`,
        error,
      );
      return null;
    }
  }

  async setOrder(order: OrderCacheData): Promise<void> {
    try {
      if (!order || !order._id) return;
      const cacheKey = this._getCacheKey(order._id.toString());
      await typedRedis.setJson(cacheKey, order, this.CACHE_TTL);
      logger.debug(`[OrderCache] Заказ ${order._id} сохранен в кеш`);
    } catch (error) {
      logger.error("[OrderCache] Ошибка сохранения заказа в кеш:", error);
    }
  }

  async getUserOrders(
    userId: string,
    status: OrderStatusFilter = null,
  ): Promise<OrderCacheData[] | null> {
    try {
      const cacheKey =
        this._getUserOrdersKey(userId) + (status ? `:${status}` : "");
      const cached = await typedRedis.getJson<OrderCacheData[]>(cacheKey);
      if (cached) {
        logger.debug(
          `[OrderCache] Список заказов пользователя ${userId} получен из кеша`,
        );
        return cached;
      }
      return null;
    } catch (error) {
      logger.error(
        `[OrderCache] Ошибка получения списка заказов пользователя ${userId}:`,
        error,
      );
      return null;
    }
  }

  async setUserOrders(
    userId: string,
    orders: OrderCacheData[],
    status: OrderStatusFilter = null,
  ): Promise<void> {
    try {
      const cacheKey =
        this._getUserOrdersKey(userId) + (status ? `:${status}` : "");
      await typedRedis.setJson(cacheKey, orders, this.LISTS_TTL);
      logger.debug(
        `[OrderCache] Список заказов пользователя ${userId} сохранен в кеш`,
      );
    } catch (error) {
      logger.error(
        `[OrderCache] Ошибка сохранения списка заказов пользователя ${userId}:`,
        error,
      );
    }
  }

  async getAdminOrders(
    filter: AdminOrdersFilter = {},
  ): Promise<OrderCacheData[] | null> {
    try {
      const filterKey = JSON.stringify(filter);
      const cacheKey = this._getAdminOrdersKey(filterKey);
      const cached = await typedRedis.getJson<OrderCacheData[]>(cacheKey);
      if (cached) {
        logger.debug("[OrderCache] Список заказов админа получен из кеша");
        return cached;
      }
      return null;
    } catch (error) {
      logger.error(
        "[OrderCache] Ошибка получения списка заказов админа:",
        error,
      );
      return null;
    }
  }

  async setAdminOrders(
    filter: AdminOrdersFilter,
    orders: OrderCacheData[],
  ): Promise<void> {
    try {
      const filterKey = JSON.stringify(filter);
      const cacheKey = this._getAdminOrdersKey(filterKey);
      await typedRedis.setJson(cacheKey, orders, this.LISTS_TTL);
      logger.debug("[OrderCache] Список заказов админа сохранен в кеш");
    } catch (error) {
      logger.error(
        "[OrderCache] Ошибка сохранения списка заказов админа:",
        error,
      );
    }
  }
}

export default new OrderCacheService();
