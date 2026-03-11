// routes/reviews.routes.js
import { Router } from "express";

const router = Router();

import ReviewsController from "../controllers/reviewsController";
import authMiddleware from "../middlewares/auth-middleware";

const reviewsController = new ReviewsController();

router.get(
  "/products/:productId/reviews",
  authMiddleware.optionalAuth("all", true),
  reviewsController.getProductReviews.bind(reviewsController),
);

router.get(
  "/products/:productId/reviews/stats",
  authMiddleware.optionalAuth("all", true),
  reviewsController.getProductReviewsStats.bind(reviewsController),
);

router.get(
  "/users/reviews",
  authMiddleware("user"),
  reviewsController.getUserReviews.bind(reviewsController),
);

router.post(
  "/products/:productId/reviews",
  authMiddleware(["user", "admin"]),
  reviewsController.createReview.bind(reviewsController),
);

router.patch(
  "/reviews/:reviewId/status",
  authMiddleware(["admin"]),
  reviewsController.updateReviewStatus.bind(reviewsController),
);

router.get(
  "/admin/reviews",
  authMiddleware(["admin"]),
  reviewsController.getAllReviews.bind(reviewsController),
);

router.get(
  "/reviews/:reviewId",
  authMiddleware(["user", "admin"]),
  reviewsController.getReviewById.bind(reviewsController),
);

export default router;
