// services/cache/delivery-cache.service.js

import logger from "../logger/logger.js";

const { error: _error, debug } = logger;

import redis from "../redis/redis.client.js";

const { keys: _keys, del, getJson, setJson } = redis;

class DeliveryCacheService {
  constructor() {
    this.CACHE_PREFIX = "delivery:";
    this.PICKUP_POINTS_KEY = `${this.CACHE_PREFIX}pickup-points`;
    this.TRANSPORT_COMPANIES_KEY = `${this.CACHE_PREFIX}transport-companies`;
    this.CACHE_TTL = 1800; // 30 минут
  }

  // ========== PICKUP POINTS ==========

  async getPickupPoints() {
    try {
      const cached = await getJson(this.PICKUP_POINTS_KEY);
      if (cached) {
        debug("[DeliveryCache] Pickup points loaded from cache");
        return cached;
      }
      return null;
    } catch (error) {
      _error("[DeliveryCache] Error getting pickup points from cache:", error);
      return null;
    }
  }

  async setPickupPoints(points) {
    try {
      await setJson(this.PICKUP_POINTS_KEY, points, this.CACHE_TTL);
      debug("[DeliveryCache] Pickup points saved to cache");
    } catch (error) {
      _error("[DeliveryCache] Error saving pickup points to cache:", error);
    }
  }

  async invalidatePickupPoints() {
    try {
      await del(this.PICKUP_POINTS_KEY);
      debug("[DeliveryCache] Pickup points cache invalidated");
    } catch (error) {
      _error("[DeliveryCache] Error invalidating pickup points cache:", error);
    }
  }

  // ========== TRANSPORT COMPANIES ==========

  async getTransportCompanies() {
    try {
      const cached = await getJson(this.TRANSPORT_COMPANIES_KEY);
      if (cached) {
        debug("[DeliveryCache] Transport companies loaded from cache");
        return cached;
      }
      return null;
    } catch (error) {
      _error(
        "[DeliveryCache] Error getting transport companies from cache:",
        error,
      );
      return null;
    }
  }

  async setTransportCompanies(companies) {
    try {
      await setJson(this.TRANSPORT_COMPANIES_KEY, companies, this.CACHE_TTL);
      debug("[DeliveryCache] Transport companies saved to cache");
    } catch (error) {
      _error(
        "[DeliveryCache] Error saving transport companies to cache:",
        error,
      );
    }
  }

  async invalidateTransportCompanies() {
    try {
      await del(this.TRANSPORT_COMPANIES_KEY);
      debug("[DeliveryCache] Transport companies cache invalidated");
    } catch (error) {
      _error(
        "[DeliveryCache] Error invalidating transport companies cache:",
        error,
      );
    }
  }

  // ========== BULK INVALIDATION ==========

  async invalidateAll() {
    try {
      const keys = await _keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await del(...keys);
        debug("[DeliveryCache] All delivery cache invalidated");
      }
    } catch (error) {
      _error("[DeliveryCache] Error invalidating all delivery cache:", error);
    }
  }
}

export default new DeliveryCacheService();
