// services/reviews.service.ts
/** biome-ignore-all lint/performance/noAccumulatingSpread: <explanation> */
/** biome-ignore-all lint/suspicious/noDuplicateElseIf: <explanation> */

import type { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { ProductModel, ProductReviewModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import { sendNotification } from "../services/mailService.js";
import type { IProduct } from "../types/product.types.js";
import type {
  ProductReviewDocument,
  ReviewStatus,
} from "../types/productReview.types.js";
import { PurchaseCheckService } from "./purchaseCheckService.js";
import { RatingService } from "./ratingService.js";

// Расширенный интерфейс Redis клиента с кастомными методами
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<number>;
  deletePattern(pattern: string): Promise<void>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

// Опции для получения отзывов
interface GetReviewsOptions {
  status?: ReviewStatus | "all";
  sort?: string;
}

// Данные для создания отзыва
interface CreateReviewData {
  userId: string | Types.ObjectId;
  productId: string | Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  pros?: string[];
  cons?: string[];
}

// Фильтры для getAllReviews
interface GetAllReviewsFilters {
  productId?: string | Types.ObjectId;
  userId?: string | Types.ObjectId;
  status?: ReviewStatus;
  sort?: string;
}

// Статистика отзывов
interface ProductReviewsStats {
  averageRating: number;
  totalReviews: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

// Информация о пользователе для отзывов
interface UserReviewInfo {
  hasPurchased: boolean;
  hasReviewed: boolean;
}

// Расширенный продукт со статистикой
interface ProductWithStats extends Omit<IProduct, "_id"> {
  _id: Types.ObjectId;
  reviewsStats: ProductReviewsStats;
  userInfo?: UserReviewInfo;
}

export class ReviewsService {
  private readonly CACHE_TTL = 3600; // 1 час
  private readonly PRODUCT_REVIEWS_CACHE_PREFIX = "product:reviews:";
  private readonly PRODUCT_STATS_CACHE_PREFIX = "product:stats:";
  private readonly USER_REVIEWS_CACHE_PREFIX = "user:reviews:";
  private readonly ratingService: RatingService;

  constructor() {
    this.ratingService = new RatingService();
  }

  async getProductReviewsCount(
    productId: string | Types.ObjectId,
  ): Promise<number> {
    return await ProductReviewModel.countDocuments({ product: productId });
  }

  async getProductReviews(
    productId: string | Types.ObjectId,
    userId: string | Types.ObjectId | null = null,
    options: GetReviewsOptions = {},
  ): Promise<{ reviews: ProductReviewDocument[]; userInfo?: UserReviewInfo }> {
    const { status = "approved", sort = "-createdAt" } = options;
    const cacheKey = `${this.PRODUCT_REVIEWS_CACHE_PREFIX}${productId}:${status}:${sort}`;

    let reviews: ProductReviewDocument[] | null = null;
    try {
      reviews = await typedRedis.getJson<ProductReviewDocument[]>(cacheKey);
    } catch (error) {
      console.error("Redis cache error:", error);
    }

    if (!reviews) {
      const query = { product: productId, status };
      reviews = await ProductReviewModel.find(query)
        .populate("user", "firstName lastName avatar")
        .sort(sort);
      try {
        await typedRedis.setJson(cacheKey, reviews, this.CACHE_TTL);
      } catch (error) {
        console.error("Redis cache set error:", error);
      }
    }

    if (userId) {
      try {
        const [hasPurchased, hasReviewed] = await Promise.all([
          this.checkIfUserBoughtProduct(userId, productId),
          this.checkIfUserHasReviewed(userId, productId),
        ]);
        return {
          reviews,
          userInfo: { hasPurchased, hasReviewed },
        };
      } catch (error) {
        console.error("Error getting user info for reviews:", error);
        return {
          reviews,
          userInfo: { hasPurchased: false, hasReviewed: false },
        };
      }
    }

    return { reviews };
  }

  async getProductReviewsStats(
    productId: string | Types.ObjectId,
    userId: string | Types.ObjectId | null = null,
  ): Promise<ProductReviewsStats & { userInfo?: UserReviewInfo }> {
    const cacheKey = `${this.PRODUCT_STATS_CACHE_PREFIX}${productId}`;

    let stats: ProductReviewsStats | null = null;
    try {
      stats = await typedRedis.getJson<ProductReviewsStats>(cacheKey);
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
            ratingDistribution: { $push: "$rating" },
          },
        },
      ]);

      const result = aggregationResult[0] || {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: [],
      };

      const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };
      for (const rating of result.ratingDistribution) {
        const star = Math.round(rating) as 1 | 2 | 3 | 4 | 5;
        if (distribution[star] !== undefined) {
          distribution[star]++;
        }
      }

      stats = {
        averageRating: result.averageRating
          ? Number(result.averageRating.toFixed(2))
          : 0,
        totalReviews: result.totalReviews,
        distribution,
      };

      try {
        await typedRedis.setJson(cacheKey, stats, this.CACHE_TTL);
      } catch (error) {
        console.error("Redis cache set error:", error);
      }
    }

    if (userId) {
      const [hasPurchased, hasReviewed] = await Promise.all([
        this.checkIfUserBoughtProduct(userId, productId),
        this.checkIfUserHasReviewed(userId, productId),
      ]);
      return {
        ...stats,
        userInfo: { hasPurchased, hasReviewed },
      };
    }

    return stats;
  }

  async getProductWithUserInfo(
    productId: string | Types.ObjectId,
    userId: string | Types.ObjectId | null = null,
  ): Promise<ProductWithStats> {
    const product = await ProductModel.findById(productId)
      .select("-__v")
      .lean();
    if (!product) {
      throw ApiError.NotFoundError("Товар не найден");
    }

    const reviewsStats = await this.getProductReviewsStats(productId);
    const result: ProductWithStats = {
      ...product,
      _id: product._id,
      reviewsStats,
    };

    if (userId) {
      const [hasPurchased, hasReviewed] = await Promise.all([
        this.checkIfUserBoughtProduct(userId, productId),
        this.checkIfUserHasReviewed(userId, productId),
      ]);
      result.userInfo = { hasPurchased, hasReviewed };
    }

    return result;
  }

  async getMultipleProductsWithUserInfo(
    productIds: (string | Types.ObjectId)[],
    userId: string | Types.ObjectId | null = null,
  ): Promise<ProductWithStats[]> {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return [];
    }

    const products = await ProductModel.find({ _id: { $in: productIds } })
      .select("-__v")
      .lean();

    const productsWithStats = await Promise.all(
      products.map(async (product) => {
        const reviewsStats = await this.getProductReviewsStats(product._id);
        return {
          ...product,
          _id: product._id,
          reviewsStats,
        };
      }),
    );

    if (!userId) {
      return productsWithStats;
    }

    const [purchaseStatus, reviewStatus] = await Promise.all([
      PurchaseCheckService.hasUserPurchasedProducts(userId, productIds),
      this.checkIfUserHasReviewedMultiple(userId, productIds),
    ]);

    return productsWithStats.map((product) => ({
      ...product,
      userInfo: {
        hasPurchased: purchaseStatus[String(product._id)] || false,
        hasReviewed: reviewStatus[String(product._id)] || false,
      },
    }));
  }

  async getUserReviews(
    userId: string | Types.ObjectId,
    options: GetReviewsOptions = {},
  ): Promise<ProductReviewDocument[]> {
    const { status, sort = "-createdAt" } = options;
    const cacheKey = `${this.USER_REVIEWS_CACHE_PREFIX}${userId}:${status || "all"}:${sort}`;

    try {
      const cached =
        await typedRedis.getJson<ProductReviewDocument[]>(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.error("Redis cache error:", error);
    }

    const query: Record<string, unknown> = { user: userId };
    if (status) query.status = status;

    const reviews = await ProductReviewModel.find(query)
      .populate("product", "title images price")
      .sort(sort);

    try {
      await typedRedis.setJson(cacheKey, reviews, 1800);
    } catch (error) {
      console.error("Redis cache set error:", error);
    }

    return reviews;
  }

  async createReview(data: CreateReviewData): Promise<ProductReviewDocument> {
    const {
      userId,
      productId,
      rating,
      title,
      comment,
      pros = [],
      cons = [],
    } = data;

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

    const hasBought = await PurchaseCheckService.hasUserPurchasedProductBySku(
      userId,
      product.sku,
    );
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
      status: "pending",
      isVerifiedPurchase: true,
      helpfulCount: 0,
      notHelpfulCount: 0,
    });

    await this.invalidateCache(productId, userId);

    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    await sendNotification(adminEmail, "newProductReview", {
      reviewId: String(review._id),
      productTitle: product.title,
      userName: "Пользователь",
      rating,
      comment,
    });

    return review;
  }

  async updateReviewStatus(
    reviewId: string | Types.ObjectId,
    status: ReviewStatus,
  ): Promise<ProductReviewDocument> {
    const review = await ProductReviewModel.findById(reviewId).populate<{
      product: { _id: Types.ObjectId };
    }>("product", "_id");

    if (!review) {
      throw ApiError.NotFoundError("Отзыв не найден");
    }

    const oldStatus = review.status;
    review.status = status;
    await review.save();

    if (oldStatus !== status) {
      if (status === "approved") {
        await this.ratingService.updateProductRating(
          review.product._id,
          review.rating,
        );
      } else if (oldStatus === "approved" && status === "rejected") {
        await this.ratingService.updateProductRating(
          review.product._id,
          null,
          review.rating,
          true,
        );
      } else if (oldStatus === "rejected" && status === "approved") {
        await this.ratingService.updateProductRating(
          review.product._id,
          review.rating,
        );
      }

      await this.invalidateCache(review.product._id, review.user);

      try {
        await typedRedis.del(
          `${this.PRODUCT_STATS_CACHE_PREFIX}${review.product._id}`,
        );
      } catch (error) {
        console.error("Redis cache delete error:", error);
      }
    }

    return review;
  }

  async getAllReviews(
    filters: GetAllReviewsFilters = {},
  ): Promise<ProductReviewDocument[]> {
    const { productId, userId, status, sort = "-createdAt" } = filters;
    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (productId) query.product = productId;
    if (userId) query.user = userId;

    const reviews = await ProductReviewModel.find(query)
      .populate("user", "firstName lastName email")
      .populate("product", "title sku")
      .sort(sort);

    return reviews;
  }

  async getReviewById(
    reviewId: string | Types.ObjectId,
  ): Promise<ProductReviewDocument> {
    const review = await ProductReviewModel.findById(reviewId)
      .populate("user", "firstName lastName avatar")
      .populate("product", "title images");
    if (!review) {
      throw ApiError.NotFoundError("Отзыв не найден");
    }
    return review;
  }

  async checkIfUserBoughtProduct(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<boolean> {
    if (!userId || !productId) return false;
    return await PurchaseCheckService.hasUserPurchasedProduct(
      userId,
      productId,
    );
  }

  async checkIfUserHasReviewed(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<boolean> {
    if (!userId || !productId) return false;
    try {
      const review = await ProductReviewModel.exists({
        user: userId,
        product: productId,
      });
      return !!review;
    } catch (error) {
      console.error("Error checking user review:", error);
      return false;
    }
  }

  async checkIfUserHasReviewedMultiple(
    userId: string | Types.ObjectId,
    productIds: (string | Types.ObjectId)[],
  ): Promise<Record<string, boolean>> {
    if (!userId || !Array.isArray(productIds) || productIds.length === 0) {
      return {};
    }
    try {
      const reviews = await ProductReviewModel.find({
        user: userId,
        product: { $in: productIds },
      }).select("product");
      const reviewStatus: Record<string, boolean> = {};
      for (const productId of productIds) {
        const idStr = String(productId);
        reviewStatus[idStr] = reviews.some((r) => String(r.product) === idStr);
      }
      return reviewStatus;
    } catch (error) {
      console.error("Error checking multiple user reviews:", error);
      return productIds.reduce(
        (acc, id) => ({ ...acc, [String(id)]: false }),
        {},
      );
    }
  }

  async invalidateCache(
    productId: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
  ): Promise<void> {
    try {
      await typedRedis.deletePattern(
        `${this.PRODUCT_REVIEWS_CACHE_PREFIX}${productId}:*`,
      );
      await typedRedis.del(`${this.PRODUCT_STATS_CACHE_PREFIX}${productId}`);
      if (userId) {
        await typedRedis.deletePattern(
          `${this.USER_REVIEWS_CACHE_PREFIX}${userId}:*`,
        );
      }
    } catch (error) {
      console.error("Cache invalidation error:", error);
    }
  }

  async invalidateProductReviewsCache(
    productId: string | Types.ObjectId,
  ): Promise<void> {
    try {
      await typedRedis.deletePattern(
        `${this.PRODUCT_REVIEWS_CACHE_PREFIX}${productId}:*`,
      );
    } catch (error) {
      console.error("Product reviews cache invalidation error:", error);
    }
  }

  // Статические методы для внешнего использования
  static async checkIfUserHasReviewedStatic(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<boolean> {
    const service = new ReviewsService();
    return await service.checkIfUserHasReviewed(userId, productId);
  }

  static async checkIfUserBoughtProductStatic(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<boolean> {
    const service = new ReviewsService();
    return await service.checkIfUserBoughtProduct(userId, productId);
  }

  static async getProductReviewsCountStatic(
    productId: string | Types.ObjectId,
  ): Promise<number> {
    const service = new ReviewsService();
    return await service.getProductReviewsCount(productId);
  }
}
