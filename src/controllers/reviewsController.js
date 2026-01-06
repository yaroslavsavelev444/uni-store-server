// controllers/reviews.controller.js
const ApiError = require("../exceptions/api-error");
const ReviewsService = require("../services/reviewService");

class ReviewsController {
  constructor() {
    this.reviewsService = new ReviewsService();
  }
  async getProductReviews(req, res, next) {
    try {
      const { productId } = req.params;
      const { status = "approved", sort = "-createdAt" } = req.query;
      const userId = req?.user ? req.user.id : null;
      if (!productId) {
        throw ApiError.BadRequest("Отсутствует productId");
      }

      const reviews = await this.reviewsService.getProductReviews(productId, userId,  {
        status,
        sort,
      });

      res.json(reviews);
    } catch (e) {
      next(e);
    }
  }

  async getProductReviewsStats(req, res, next) {
    try {
      const { productId } = req.params;

      if (!productId) {
        throw ApiError.BadRequest("Отсутствует productId");
      }

      const stats = await this.reviewsService.getProductReviewsStats(productId);
      res.json(stats);
    } catch (e) {
      next(e);
    }
  }

  async getUserReviews(req, res, next) {
    try {
      const { status, sort = "-createdAt" } = req.query;
      const reviews = await this.reviewsService.getUserReviews(req.user.id, {
        status,
        sort,
      });
      res.json(reviews);
    } catch (e) {
      next(e);
    }
  }

  async createReview(req, res, next) {
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

      if (rating < 1 || rating > 5) {
        throw ApiError.BadRequest("Рейтинг должен быть от 1 до 5");
      }

      const review = await this.reviewsService.createReview({
        userId,
        productId,
        rating,
        title,
        comment,
        pros: Array.isArray(pros) ? pros : [pros],
        cons: Array.isArray(cons) ? cons : [cons],
      });

      res.status(201).json(review);
    } catch (e) {
      next(e);
    }
  }

  async updateReviewStatus(req, res, next) {
    try {
      const { reviewId } = req.params;
      const { status } = req.body;

      if (!reviewId) {
        throw ApiError.BadRequest("Отсутствует reviewId");
      }

      if (!status || !["pending", "approved", "rejected"].includes(status)) {
        throw ApiError.BadRequest("Некорректный статус");
      }

      const review = await this.reviewsService.updateReviewStatus(
        reviewId,
        status
      );
      res.json(review);
    } catch (e) {
      next(e);
    }
  }

  async getAllReviews(req, res, next) {
    try {
      const { status, productId, userId, sort = "-createdAt" } = req.query;
      const reviews = await this.reviewsService.getAllReviews({
        status,
        productId,
        userId,
        sort,
      });

      res.json(reviews);
    } catch (e) {
      next(e);
    }
  }

  async getReviewById(req, res, next) {
    try {
      const { reviewId } = req.params;

      if (!reviewId) {
        throw ApiError.BadRequest("Отсутствует reviewId");
      }

      const review = await this.reviewsService.getReviewById(reviewId);

      // Проверка прав доступа
      if (req.user.role !== "admin" && review.user.toString() !== req.user.id) {
        throw ApiError.Forbidden();
      }

      res.json(review);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = ReviewsController;
