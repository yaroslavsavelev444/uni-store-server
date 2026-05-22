// services/cache/delivery-cache.service.js
const redisClient = require('../redis/redis.client');
const logger = require('../logger/logger');

class DeliveryCacheService {
  constructor() {
    this.CACHE_PREFIX = 'delivery:';
    this.PICKUP_POINTS_KEY = `${this.CACHE_PREFIX}pickup-points`;
    this.TRANSPORT_COMPANIES_KEY = `${this.CACHE_PREFIX}transport-companies`;
    this.CACHE_TTL = 1800; // 30 минут
  }

  // ========== PICKUP POINTS ==========

  async getPickupPoints() {
    try {
      const cached = await redisClient.getJson(this.PICKUP_POINTS_KEY);
      if (cached) {
        logger.debug('[DeliveryCache] Pickup points loaded from cache');
        return cached;
      }
      return null;
    } catch (error) {
      logger.error('[DeliveryCache] Error getting pickup points from cache:', error);
      return null;
    }
  }

  async setPickupPoints(points) {
    try {
      await redisClient.setJson(this.PICKUP_POINTS_KEY, points, this.CACHE_TTL);
      logger.debug('[DeliveryCache] Pickup points saved to cache');
    } catch (error) {
      logger.error('[DeliveryCache] Error saving pickup points to cache:', error);
    }
  }

  async invalidatePickupPoints() {
    try {
      await redisClient.del(this.PICKUP_POINTS_KEY);
      logger.debug('[DeliveryCache] Pickup points cache invalidated');
    } catch (error) {
      logger.error('[DeliveryCache] Error invalidating pickup points cache:', error);
    }
  }

  // ========== TRANSPORT COMPANIES ==========

  async getTransportCompanies() {
    try {
      const cached = await redisClient.getJson(this.TRANSPORT_COMPANIES_KEY);
      if (cached) {
        logger.debug('[DeliveryCache] Transport companies loaded from cache');
        return cached;
      }
      return null;
    } catch (error) {
      logger.error('[DeliveryCache] Error getting transport companies from cache:', error);
      return null;
    }
  }

  async setTransportCompanies(companies) {
    try {
      await redisClient.setJson(this.TRANSPORT_COMPANIES_KEY, companies, this.CACHE_TTL);
      logger.debug('[DeliveryCache] Transport companies saved to cache');
    } catch (error) {
      logger.error('[DeliveryCache] Error saving transport companies to cache:', error);
    }
  }

  async invalidateTransportCompanies() {
    try {
      await redisClient.del(this.TRANSPORT_COMPANIES_KEY);
      logger.debug('[DeliveryCache] Transport companies cache invalidated');
    } catch (error) {
      logger.error('[DeliveryCache] Error invalidating transport companies cache:', error);
    }
  }

  // ========== BULK INVALIDATION ==========

  async invalidateAll() {
    try {
      const keys = await redisClient.keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        logger.debug('[DeliveryCache] All delivery cache invalidated');
      }
    } catch (error) {
      logger.error('[DeliveryCache] Error invalidating all delivery cache:', error);
    }
  }
}

module.exports = new DeliveryCacheService();