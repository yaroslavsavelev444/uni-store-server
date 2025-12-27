// services/reviews.service.js
const ApiError = require("../exceptions/api-error");
const { ProductModel, ProductReviewModel } = require("../models/index.models");
const redisClient = require("../redis/redis.client");
const { sendEmailNotification } = require("../queues/taskQueues");

class ReviewsService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 час
    this.PRODUCT_REVIEWS_CACHE_PREFIX = "product:reviews:";
    this.PRODUCT_STATS_CACHE_PREFIX = "product:stats:";
    this.USER_REVIEWS_CACHE_PREFIX = "user:reviews:";
  }


  async getProductReviews(productId, options = {}) {
    const { status = "approved", sort = "-createdAt" } = options;

    const cacheKey = `${this.PRODUCT_REVIEWS_CACHE_PREFIX}${productId}:${status}:${sort}`;

    try {
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.error("Redis cache error:", error);
    }

    const query = { product: productId, status };

    const reviews = await ProductReviewModel.find(query)
      .populate("user", "firstName lastName avatar")
      .sort(sort);

    try {
      await redisClient.setJson(cacheKey, reviews, this.CACHE_TTL);
    } catch (error) {
      console.error("Redis cache set error:", error);
    }

    return reviews;
  }

  async getProductReviewsStats(productId) {
    const cacheKey = `${this.PRODUCT_STATS_CACHE_PREFIX}${productId}`;

    try {
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.error("Redis cache error:", error);
    }

    const stats = await ProductReviewModel.aggregate([
      { $match: { product: productId, status: "approved" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating",
          },
        },
      },
    ]);

    const result = stats[0] || {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: [],
    };

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    result.ratingDistribution.forEach((rating) => {
      const star = Math.round(rating);
      if (distribution[star] !== undefined) {
        distribution[star]++;
      }
    });

    const finalResult = {
      averageRating: result.averageRating
        ? Number(result.averageRating.toFixed(2))
        : 0,
      totalReviews: result.totalReviews,
      distribution,
    };

    try {
      await redisClient.setJson(cacheKey, finalResult, this.CACHE_TTL);
    } catch (error) {
      console.error("Redis cache set error:", error);
    }

    return finalResult;
  }

  async getUserReviews(userId, options = {}) {
    const { status, sort = "-createdAt" } = options;
    const cacheKey = `${this.USER_REVIEWS_CACHE_PREFIX}${userId}:${
      status || "all"
    }:${sort}`;

    try {
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.error("Redis cache error:", error);
    }

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const reviews = await ProductReviewModel.find(query)
      .populate("product", "title images price")
      .sort(sort);

    try {
      await redisClient.setJson(cacheKey, reviews, 1800); // 30 минут для пользовательских данных
    } catch (error) {
      console.error("Redis cache set error:", error);
    }

    return reviews;
  }

  async createReview(data) {
    const { userId, productId, rating, title, comment, pros, cons } = data;

    const product = await ProductModel.findById(productId);
    if (!product) {
      throw ApiError.BadRequest("Товар не найден");
    }
    
    const existingReview = await ProductReviewModel.findOne({
      user: userId,
      product: productId,
    });

    if (existingReview) {
      throw ApiError.BadRequest("Вы уже оставили отзыв на этот товар");
    }

    // Проверяем, покупал ли пользователь товар (если требуется)
    // const hasBought = await this.checkIfUserBoughtProduct(userId, productId);
    // Пока пропустим эту проверку, но можно добавить логику из orderService

    const review = await ProductReviewModel.create({
      user: userId,
      product: productId,
      rating,
      title,
      comment,
      pros,
      cons,
      status: "pending", // Требует одобрения админа
      isVerifiedPurchase: false, // Можно добавить логику проверки покупки
    });

    // Инвалидируем кэш
    await this.invalidateCache(productId, userId);

    // Отправляем уведомление админу
    sendEmailNotification(
      process.env.ADMIN_EMAIL || "admin@example.com",
      "newProductReview",
      {
        reviewId: review._id,
        productTitle: product.title,
        userName: "Пользователь",
        rating,
        comment,
      }
    );

    return review;
  }

  async updateReviewStatus(reviewId, status) {
    const review = await ProductReviewModel.findById(reviewId).populate(
      "product",
      "_id"
    );

    if (!review) {
      throw ApiError.NotFound("Отзыв не найден");
    }

    const oldStatus = review.status;
    review.status = status;
    await review.save();

    if (
      oldStatus !== status &&
      (status === "approved" || status === "rejected")
    ) {
      await this.invalidateCache(review.product._id, review.user);

      try {
        await redisClient.del(
          `${this.PRODUCT_STATS_CACHE_PREFIX}${review.product._id}`
        );
      } catch (error) {
        console.error("Redis cache delete error:", error);
      }
    }

    return review;
  }

  async getAllReviews(filters = {}) {
    const { status, productId, userId, sort = "-createdAt" } = filters;

    const query = {};

    if (status) query.status = status;
    if (productId) query.product = productId;
    if (userId) query.user = userId;

    const reviews = await ProductReviewModel.find(query)
      .populate("user", "firstName lastName email")
      .populate("product", "title sku")
      .sort(sort);

    return reviews;
  }

  async getReviewById(reviewId) {
    const review = await ProductReviewModel.findById(reviewId)
      .populate("user", "firstName lastName avatar")
      .populate("product", "title images");

    if (!review) {
      throw ApiError.NotFound("Отзыв не найден");
    }

    return review;
  }


  // Инвалидация кэша
  async invalidateCache(productId, userId) {
    try {
      await redisClient.deletePattern(
        `${this.PRODUCT_REVIEWS_CACHE_PREFIX}${productId}:*`
      );

      await redisClient.del(`${this.PRODUCT_STATS_CACHE_PREFIX}${productId}`);

      if (userId) {
        await redisClient.deletePattern(
          `${this.USER_REVIEWS_CACHE_PREFIX}${userId}:*`
        );
      }
    } catch (error) {
      console.error("Cache invalidation error:", error);
    }
  }

  async invalidateProductReviewsCache(productId) {
    try {
      await redisClient.deletePattern(
        `${this.PRODUCT_REVIEWS_CACHE_PREFIX}${productId}:*`
      );
    } catch (error) {
      console.error("Product reviews cache invalidation error:", error);
    }
  }

  // Проверка, покупал ли пользователь товар (заглушка)
  async checkIfUserBoughtProduct(userId, productId) {
    // TODO: Реализовать проверку через сервис заказов
    // const orderService = require("./orderService");
    // return await orderService.hasUserBoughtProduct(userId, productId);
    return true; // Временно возвращаем true для тестирования
  }
}

module.exports = ReviewsService;
