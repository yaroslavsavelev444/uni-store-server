// controllers/reviewsController.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import { ReviewsService } from "../services/reviewService.js";
import type {
  CreateReviewReq,
  GetAllReviewsReq,
  GetProductReviewsReq,
  GetProductReviewsStatsReq,
  GetReviewByIdReq,
  GetUserReviewsReq,
  UpdateReviewStatusReq,
} from "../types/controllers/reviews-controller.js";

/**
 * Контроллер для работы с отзывами на товары
 */
class ReviewsController {
  private readonly reviewsService: ReviewsService;

  constructor() {
    this.reviewsService = new ReviewsService();
  }

  /**
   * Получение отзывов на товар (доступно всем, userId извлекается из токена при наличии)
   */
  getProductReviews = async (
    req: GetProductReviewsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { productId } = req.params;
      const { status = "approved", sort = "-createdAt" } = req.query;
      const userId = req.user?.id ?? null;

      if (!productId) {
        throw ApiError.BadRequest("Отсутствует productId");
      }

      const result = await this.reviewsService.getProductReviews(
        productId,
        userId,
        { status, sort },
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение статистики отзывов на товар (доступно всем)
   */
  getProductReviewsStats = async (
    req: GetProductReviewsStatsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { productId } = req.params;

      if (!productId) {
        throw ApiError.BadRequest("Отсутствует productId");
      }

      const stats = await this.reviewsService.getProductReviewsStats(productId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение отзывов текущего пользователя (требуется авторизация)
   */
  getUserReviews = async (
    req: GetUserReviewsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { status, sort = "-createdAt" } = req.query;
      const userId = req.user.id; // гарантирован middleware

      const reviews = await this.reviewsService.getUserReviews(userId, {
        status,
        sort,
      });

      res.json(reviews);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Создание нового отзыва (требуется авторизация, проверка покупки)
   */
  createReview = async (
    req: CreateReviewReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { productId } = req.params;
      const userId = req.user.id;
      const { rating, title, comment, pros = [], cons = [] } = req.body;

      if (!productId) {
        throw ApiError.BadRequest("Отсутствует productId");
      }

      if (!rating || !comment) {
        throw ApiError.BadRequest("Рейтинг и комментарий обязательны");
      }

      if (typeof rating !== "number" || rating < 1 || rating > 5) {
        throw ApiError.BadRequest("Рейтинг должен быть числом от 1 до 5");
      }

      const prosArray = Array.isArray(pros) ? pros : [pros];
      const consArray = Array.isArray(cons) ? cons : [cons];

      const review = await this.reviewsService.createReview({
        userId,
        productId,
        rating,
        title,
        comment,
        pros: prosArray,
        cons: consArray,
      });

      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновление статуса отзыва (только для администраторов)
   */
  updateReviewStatus = async (
    req: UpdateReviewStatusReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { reviewId } = req.params;
      const { status } = req.body;

      if (!reviewId) {
        throw ApiError.BadRequest("Отсутствует reviewId");
      }

      const validStatuses = ["pending", "approved", "rejected"] as const;
      if (!status || !validStatuses.includes(status)) {
        throw ApiError.BadRequest("Некорректный статус");
      }

      const review = await this.reviewsService.updateReviewStatus(
        reviewId,
        status,
      );

      res.json(review);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение всех отзывов с фильтрацией (только для администраторов)
   */
  getAllReviews = async (
    req: GetAllReviewsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { status, productId, userId, sort = "-createdAt" } = req.query;

      const reviews = await this.reviewsService.getAllReviews({
        status,
        productId,
        userId,
        sort,
      });

      res.json(reviews);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение отзыва по ID (администратор или владелец отзыва)
   */
  getReviewById = async (
    req: GetReviewByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { reviewId } = req.params;

      if (!reviewId) {
        throw ApiError.BadRequest("Отсутствует reviewId");
      }

      const review = await this.reviewsService.getReviewById(reviewId);
      const currentUserId = req.user.id;
      const currentUserRole = req.user.role;

      // Проверка прав: администратор или владелец отзыва
      const isOwner = review.user.toString() === currentUserId;
      if (currentUserRole !== "admin" && !isOwner) {
        throw ApiError.ForbiddenError();
      }

      res.json(review);
    } catch (error) {
      next(error);
    }
  };
}

export default new ReviewsController();
