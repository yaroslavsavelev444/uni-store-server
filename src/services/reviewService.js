// services/reviews.service.js
const ApiError = require("../exceptions/api-error");
const { ProductModel, ProductReviewModel } = require("../models/index.models");
const redisClient = require("../redis/redis.client");
const { sendEmailNotification } = require("../queues/taskQueues");
const PurchaseCheckService = require("./purchaseCheckService");
const RatingService = require("./ratingService");

class ReviewsService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 час
    this.PRODUCT_REVIEWS_CACHE_PREFIX = "product:reviews:";
    this.PRODUCT_STATS_CACHE_PREFIX = "product:stats:";
    this.USER_REVIEWS_CACHE_PREFIX = "user:reviews:";
        this.ratingService = new RatingService();

  }

  async getProductReviewsCount(productId) {
    const count = await ProductReviewModel.countDocuments({ product: productId });
    return count;
  }
  async getProductReviews(productId, userId = null, options = {}) {
  const { status = "approved", sort = "-createdAt" } = options;

  const cacheKey = `${this.PRODUCT_REVIEWS_CACHE_PREFIX}${productId}:${status}:${sort}`;

  let reviews;
  try {
    const cached = await redisClient.getJson(cacheKey);
    if (cached) {
      reviews = cached;
    }
  } catch (error) {
    console.error("Redis cache error:", error);
  }

  if (!reviews) {
    const query = { product: productId, status };

    reviews = await ProductReviewModel.find(query)
      .populate("user", "firstName lastName avatar")
      .sort(sort);

    try {
      await redisClient.setJson(cacheKey, reviews, this.CACHE_TTL);
    } catch (error) {
      console.error("Redis cache set error:", error);
    }
  }


  if (userId) { 
    try {
      const [hasPurchased, hasReviewed] = await Promise.all([
        this.checkIfUserBoughtProduct(userId, productId),
        this.checkIfUserHasReviewed(userId, productId)
      ]);

      return {
        reviews,
        userInfo: {
          hasPurchased,
          hasReviewed
        }
      };
    } catch (error) {
      console.error("Error getting user info for reviews:", error);
      return {
        reviews,
        userInfo: {
          hasPurchased : false,
          hasReviewed : false
        }
      };
    }
  }

  return { reviews };
}

  async getProductReviewsStats(productId, userId = null) {
    const cacheKey = `${this.PRODUCT_STATS_CACHE_PREFIX}${productId}`;

    let stats;
    try {
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        stats = cached;
      }
    } catch (error) {
      console.error("Redis cache error:", error);
    }

    if (!stats) {
      const aggregationResult = await ProductReviewModel.aggregate([
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

      const result = aggregationResult[0] || {
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

      stats = {
        averageRating: result.averageRating
          ? Number(result.averageRating.toFixed(2))
          : 0,
        totalReviews: result.totalReviews,
        distribution,
      };

      try {
        await redisClient.setJson(cacheKey, stats, this.CACHE_TTL);
      } catch (error) {
        console.error("Redis cache set error:", error);
      }
    }

    // Добавляем информацию о текущем пользователе, если он передан
    if (userId) {
      const [hasPurchased, hasReviewed] = await Promise.all([
        this.checkIfUserBoughtProduct(userId, productId),
        this.checkIfUserHasReviewed(userId, productId) // Убрали static из метода
      ]);

      return {
        ...stats,
        userInfo: {
          hasPurchased,
          hasReviewed
        }
      };
    }

    return stats;
  }

  async getProductWithUserInfo(productId, userId = null) {
    // Получаем информацию о товаре
    const product = await ProductModel.findById(productId)
      .select('-__v')
      .lean();

    if (!product) {
      throw ApiError.NotFound("Товар не найден");
    }

    // Получаем статистику отзывов
    const reviewsStats = await this.getProductReviewsStats(productId);
    
    // Инициализируем объект для userInfo
    let userInfo = null;

    // Если передан userId, получаем информацию о покупке и отзыве пользователя
    if (userId) {
      const [hasPurchased, hasReviewed] = await Promise.all([
        this.checkIfUserBoughtProduct(userId, productId),
        this.checkIfUserHasReviewed(userId, productId) // Исправлено: было this.chec
      ]);

      userInfo = {
        hasPurchased,
        hasReviewed
      };
    }

    // Собираем итоговый объект
    const result = {
      ...product,
      reviewsStats
    };

    if (userInfo) {
      result.userInfo = userInfo;
    }

    return result;
  }

  async getMultipleProductsWithUserInfo(productIds, userId = null) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return [];
    }

    // Получаем все товары
    const products = await ProductModel.find({
      _id: { $in: productIds }
    })
    .select('-__v')
    .lean();

    // Получаем статистику отзывов для всех товаров
    const productsWithStats = await Promise.all(
      products.map(async (product) => {
        const reviewsStats = await this.getProductReviewsStats(product._id);
        return {
          ...product,
          reviewsStats
        };
      })
    );

    // Если пользователь не передан, возвращаем товары без userInfo
    if (!userId) {
      return productsWithStats;
    }

    // Получаем информацию о покупках и отзывах для пользователя
    const [purchaseStatus, reviewStatus] = await Promise.all([
      PurchaseCheckService.hasUserPurchasedProducts(userId, productIds),
      this.checkIfUserHasReviewedMultiple(userId, productIds)
    ]);

    // Добавляем userInfo к каждому товару
    const productsWithUserInfo = productsWithStats.map(product => ({
      ...product,
      userInfo: {
        hasPurchased: purchaseStatus[product._id] || false,
        hasReviewed: reviewStatus[product._id] || false
      }
    }));

    return productsWithUserInfo;
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
    
    // Проверяем, оставлял ли пользователь уже отзыв
    const existingReview = await ProductReviewModel.findOne({
      user: userId,
      product: productId,
    });

    if (existingReview) {
      throw ApiError.BadRequest("Вы уже оставили отзыв на этот товар");
    }

    // Проверяем, покупал ли пользователь товар (если требуется)
    const hasBought = await PurchaseCheckService.hasUserPurchasedProductBySku(
      userId,
      product.sku
    )

    if (!hasBought) {
      throw ApiError.BadRequest("Вы не купили этот товар");
    }

    const review = await ProductReviewModel.create({
      user: userId,
      product: productId,
      rating,
      title,
      comment,
      pros,
      cons,
      status: "pending", // Требует одобрения админа
      isVerifiedPurchase: true, // Пользователь купил товар
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

    // !!! ВАЖНО: Обновляем рейтинг только при одобрении или отклонении !!!
    if (oldStatus !== status) {
      if (status === "approved") {
        // Добавляем рейтинг при одобрении
        await this.ratingService.updateProductRating(
          review.product._id,
          review.rating
        );
      } else if (oldStatus === "approved" && status === "rejected") {
        // Удаляем рейтинг при отклонении ранее одобренного отзыва
        await this.ratingService.updateProductRating(
          review.product._id,
          null,
          review.rating,
          true
        );
      } else if (oldStatus === "rejected" && status === "approved") {
        // Добавляем рейтинг при одобрении ранее отклоненного отзыва
        await this.ratingService.updateProductRating(
          review.product._id,
          review.rating
        );
      }

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
    const { productId, userId, status, sort = "-createdAt" } = filters;
    
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

  // Проверка, покупал ли пользователь товар
  async checkIfUserBoughtProduct(userId, productId) {
    if (!userId || !productId) {
      return false;
    }
    return await PurchaseCheckService.hasUserPurchasedProduct(userId, productId);
  }

  // Проверка, оставлял ли пользователь отзыв на товар
  async checkIfUserHasReviewed(userId, productId) { // УБРАЛИ static
    if (!userId || !productId) {
      return false;
    }

    try {
      const review = await ProductReviewModel.exists({
        user: userId,
        product: productId
      });
      return !!review;
    } catch (error) {
      console.error("Error checking user review:", error);
      return false;
    }
  }

  // Массовая проверка отзывов для нескольких товаров
  async checkIfUserHasReviewedMultiple(userId, productIds) {
    if (!userId || !Array.isArray(productIds) || productIds.length === 0) {
      return {};
    }

    try {
      const reviews = await ProductReviewModel.find({
        user: userId,
        product: { $in: productIds }
      }).select('product');

      const reviewStatus = {};
      productIds.forEach(productId => {
        reviewStatus[productId] = reviews.some(
          review => review.product.toString() === productId.toString()
        );
      });

      return reviewStatus;
    } catch (error) {
      console.error("Error checking multiple user reviews:", error);
      return productIds.reduce((acc, id) => ({ ...acc, [id]: false }), {});
    }
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

  // Дополнительно: статический метод для внешнего использования, если нужно
  static async checkIfUserHasReviewedStatic(userId, productId) {
    const service = new ReviewsService();
    return await service.checkIfUserHasReviewed(userId, productId);
  }

  // Дополнительно: статический метод для проверки покупки
  static async checkIfUserBoughtProductStatic(userId, productId) {
    const service = new ReviewsService();
    return await service.checkIfUserBoughtProduct(userId, productId);
  }
  static async getProductReviewsCountStatic(productId) {
    const service = new ReviewsService();
    return await service.getProductReviewsCount(productId);
  }
}

module.exports = ReviewsService;