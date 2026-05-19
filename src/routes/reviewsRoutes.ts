// routes/reviews.routes.ts
import { Router } from "express";
import ReviewsController from "../controllers/reviewsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

const router = Router();

// Стрелочные методы контроллера уже привязаны к экземпляру
router.get(
  "/products/:productId/reviews",
  authMiddleware.optionalAuth,
  ReviewsController.getProductReviews, // без bind
);

router.get(
  "/products/:productId/reviews/stats",
  authMiddleware.optionalAuth,
  ReviewsController.getProductReviewsStats as any,
);

router.get(
  "/users/reviews",
  authMiddleware.requireRole("user"),
  ReviewsController.getUserReviews as any,
);

router.post(
  "/products/:productId/reviews",
  authMiddleware(["user", "admin"]),
  ReviewsController.createReview as any,
);

router.patch(
  "/reviews/:reviewId/status",
  authMiddleware(["admin"]),
  ReviewsController.updateReviewStatus as any,
);

router.get(
  "/admin/reviews",
  authMiddleware(["admin"]),
  ReviewsController.getAllReviews as any,
);

router.get(
  "/reviews/:reviewId",
  authMiddleware(["user", "admin"]),
  ReviewsController.getReviewById as any,
);

export default router;
