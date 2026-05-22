// services/cache/delivery-cache.service.ts

import logger from "../logger/logger.js";
import redisClient from "../redis/redis.client.js";
import type { IPickupPoint } from "../types/pickupPoint.types.js";
import type { ITransportCompany } from "../types/transportCompany.types.js";

// Типизация Redis клиента с кастомными методами
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl: number): Promise<void>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  del(...keys: string[]): Promise<number>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

class DeliveryCacheService {
  private readonly CACHE_PREFIX = "delivery:";
  private readonly PICKUP_POINTS_KEY = `${this.CACHE_PREFIX}pickup-points`;
  private readonly TRANSPORT_COMPANIES_KEY = `${this.CACHE_PREFIX}transport-companies`;
  private readonly CACHE_TTL = 1800; // 30 минут

  // ========== PICKUP POINTS ==========

  async getPickupPoints(): Promise<IPickupPoint[] | null> {
    try {
      const cached = await typedRedis.getJson<IPickupPoint[]>(
        this.PICKUP_POINTS_KEY,
      );
      if (cached) {
        logger.debug("[DeliveryCache] Pickup points loaded from cache");
        return cached;
      }
      return null;
    } catch (error) {
      logger.error(
        "[DeliveryCache] Error getting pickup points from cache:",
        error,
      );
      return null;
    }
  }

  async setPickupPoints(points: IPickupPoint[]): Promise<void> {
    try {
      await typedRedis.setJson(this.PICKUP_POINTS_KEY, points, this.CACHE_TTL);
      logger.debug("[DeliveryCache] Pickup points saved to cache");
    } catch (error) {
      logger.error(
        "[DeliveryCache] Error saving pickup points to cache:",
        error,
      );
    }
  }

  async invalidatePickupPoints(): Promise<void> {
    try {
      await typedRedis.del(this.PICKUP_POINTS_KEY);
      logger.debug("[DeliveryCache] Pickup points cache invalidated");
    } catch (error) {
      logger.error(
        "[DeliveryCache] Error invalidating pickup points cache:",
        error,
      );
    }
  }

  // ========== TRANSPORT COMPANIES ==========

  async getTransportCompanies(): Promise<ITransportCompany[] | null> {
    try {
      const cached = await typedRedis.getJson<ITransportCompany[]>(
        this.TRANSPORT_COMPANIES_KEY,
      );
      if (cached) {
        logger.debug("[DeliveryCache] Transport companies loaded from cache");
        return cached;
      }
      return null;
    } catch (error) {
      logger.error(
        "[DeliveryCache] Error getting transport companies from cache:",
        error,
      );
      return null;
    }
  }

  async setTransportCompanies(companies: ITransportCompany[]): Promise<void> {
    try {
      await typedRedis.setJson(
        this.TRANSPORT_COMPANIES_KEY,
        companies,
        this.CACHE_TTL,
      );
      logger.debug("[DeliveryCache] Transport companies saved to cache");
    } catch (error) {
      logger.error(
        "[DeliveryCache] Error saving transport companies to cache:",
        error,
      );
    }
  }

  async invalidateTransportCompanies(): Promise<void> {
    try {
      await typedRedis.del(this.TRANSPORT_COMPANIES_KEY);
      logger.debug("[DeliveryCache] Transport companies cache invalidated");
    } catch (error) {
      logger.error(
        "[DeliveryCache] Error invalidating transport companies cache:",
        error,
      );
    }
  }

  // ========== BULK INVALIDATION ==========

  async invalidateAll(): Promise<void> {
    try {
      const keys = await typedRedis.keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await typedRedis.del(...keys);
        logger.debug("[DeliveryCache] All delivery cache invalidated");
      }
    } catch (error) {
      logger.error(
        "[DeliveryCache] Error invalidating all delivery cache:",
        error,
      );
    }
  }
}

export default new DeliveryCacheService();
