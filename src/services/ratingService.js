// services/rating.service.js
const { ProductModel, ProductReviewModel } = require("../models/index.models");
const redisClient = require("../redis/redis.client");

class RatingService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 час
    this.PRODUCT_RATING_CACHE_PREFIX = "product:rating:";
  }

  /**
   * Пересчитывает и обновляет средний рейтинг продукта
   * @param {string} productId - ID продукта
   * @param {number} newRating - Новый рейтинг (1-5)
   * @param {number} oldRating - Старый рейтинг (если обновление, иначе null)
   * @param {boolean} isDelete - Удаление отзыва
   */
  async updateProductRating(productId, newRating = null, oldRating = null, isDelete = false) {
    try {
      // Получаем все одобренные отзывы продукта
      const reviews = await ProductReviewModel.find({
        product: productId,
        status: "approved"
      }).select("rating");

      if (reviews.length === 0) {
        // Если отзывов нет, устанавливаем рейтинг 0
        return await this.setProductRating(productId, 0);
      }

      // Рассчитываем средний рейтинг
      let totalRating = 0;
      let count = 0;

      reviews.forEach(review => {
        totalRating += review.rating;
        count++;
      });

      // Если это добавление нового отзыва
      if (newRating && !oldRating && !isDelete) {
        totalRating += newRating;
        count++;
      }
      // Если это обновление отзыва
      else if (newRating && oldRating && !isDelete) {
        totalRating = totalRating - oldRating + newRating;
      }
      // Если это удаление отзыва
      else if (isDelete && oldRating) {
        totalRating -= oldRating;
        count--;
      }

      const averageRating = count > 0 ? totalRating / count : 0;
      const roundedRating = Number(averageRating.toFixed(1));

      // Обновляем рейтинг в продукте
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
  async setProductRating(productId, rating) {
    try {
      // Обновляем продукт
      const product = await ProductModel.findByIdAndUpdate(
        productId,
        { 
          rating: rating,
          updatedAt: Date.now()
        },
        { new: true }
      );

      if (!product) {
        throw new Error("Product not found");
      }

      // Инвалидируем кэш рейтинга
      await this.invalidateRatingCache(productId);

      // Инвалидируем кэш продукта
      await redisClient.deletePattern(`product:${productId}:*`);
      await redisClient.deletePattern("products:*");

      return rating;
    } catch (error) {
      console.error("Error setting product rating:", error);
      throw error;
    }
  }

  /**
   * Получает рейтинг продукта
   */
  async getProductRating(productId) {
    try {
      const cacheKey = `${this.PRODUCT_RATING_CACHE_PREFIX}${productId}`;
      
      // Пробуем получить из кэша
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return parseFloat(cached);
      }

      // Получаем из базы
      const product = await ProductModel.findById(productId).select("rating");
      if (!product) {
        return 0;
      }

      const rating = product.rating || 0;
      
      // Кэшируем
      await redisClient.set(cacheKey, rating.toString(), this.CACHE_TTL);
      
      return rating;
    } catch (error) {
      console.error("Error getting product rating:", error);
      return 0;
    }
  }

  /**
   * Инвалидирует кэш рейтинга
   */
  async invalidateRatingCache(productId) {
    try {
      await redisClient.del(`${this.PRODUCT_RATING_CACHE_PREFIX}${productId}`);
    } catch (error) {
      console.error("Error invalidating rating cache:", error);
    }
  }
}

module.exports = RatingService;