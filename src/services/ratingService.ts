// services/rating.service.ts

import type { Types } from "mongoose";
import { ProductModel, ProductReviewModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";

interface RedisClientWithPattern {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<unknown>;
  del(key: string): Promise<number>;
  deletePattern(pattern: string): Promise<unknown>;
}

const typedRedis = redisClient as RedisClientWithPattern;

export class RatingService {
  private readonly CACHE_TTL = 3600; // 1 час
  private readonly PRODUCT_RATING_CACHE_PREFIX = "product:rating:";

  /**
   * Пересчитывает и обновляет средний рейтинг продукта
   * @param productId - ID продукта
   * @param newRating - Новый рейтинг (1-5)
   * @param oldRating - Старый рейтинг (при обновлении)
   * @param isDelete - Удаление отзыва
   */
  async updateProductRating(
    productId: string | Types.ObjectId,
    newRating: number | null = null,
    oldRating: number | null = null,
    isDelete = false,
  ): Promise<number> {
    try {
      const reviews = await ProductReviewModel.find({
        product: productId,
        status: "approved",
      }).select("rating");

      if (reviews.length === 0) {
        return await this.setProductRating(productId, 0);
      }

      let totalRating = 0;
      let count = 0;

      for (const review of reviews) {
        totalRating += review.rating;
        count++;
      }

      if (newRating && !oldRating && !isDelete) {
        totalRating += newRating;
        count++;
      } else if (newRating && oldRating && !isDelete) {
        totalRating = totalRating - oldRating + newRating;
      } else if (isDelete && oldRating) {
        totalRating -= oldRating;
        count--;
      }

      const averageRating = count > 0 ? totalRating / count : 0;
      const roundedRating = Number(averageRating.toFixed(1));

      await this.setProductRating(productId, roundedRating);
      return roundedRating;
    } catch (error) {
      console.error("Error updating product rating:", error);
      throw error;
    }
  }

  /**
   * Устанавливает рейтинг продукта в базе данных
   */
  async setProductRating(
    productId: string | Types.ObjectId,
    rating: number,
  ): Promise<number> {
    try {
      const product = await ProductModel.findByIdAndUpdate(
        productId,
        {
          rating,
          updatedAt: Date.now(),
        },
        { new: true },
      );

      if (!product) {
        throw new Error("Product not found");
      }

      await this.invalidateRatingCache(productId);
      await typedRedis.deletePattern(`product:${productId}:*`);
      await typedRedis.deletePattern("products:*");

      return rating;
    } catch (error) {
      console.error("Error setting product rating:", error);
      throw error;
    }
  }

  /**
   * Получает рейтинг продукта
   */
  async getProductRating(productId: string | Types.ObjectId): Promise<number> {
    try {
      const cacheKey = `${this.PRODUCT_RATING_CACHE_PREFIX}${productId}`;
      const cached = await typedRedis.get(cacheKey);
      if (cached !== null) {
        return parseFloat(cached);
      }

      const product = await ProductModel.findById(productId).select("rating");
      if (!product) {
        return 0;
      }

      const rating = product.rating ?? 0;
      await typedRedis.set(cacheKey, rating.toString(), this.CACHE_TTL);
      return rating;
    } catch (error) {
      console.error("Error getting product rating:", error);
      return 0;
    }
  }

  /**
   * Инвалидирует кэш рейтинга
   */
  async invalidateRatingCache(
    productId: string | Types.ObjectId,
  ): Promise<void> {
    try {
      await typedRedis.del(`${this.PRODUCT_RATING_CACHE_PREFIX}${productId}`);
    } catch (error) {
      console.error("Error invalidating rating cache:", error);
    }
  }
}
