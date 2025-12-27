// routes/reviews.routes.js
const express = require("express");
const router = express.Router();
const ReviewsController = require("../controllers/reviewsController");
const authMiddleware = require("../middlewares/auth-middleware");

const reviewsController = new ReviewsController();

router.get(
  "/products/:productId/reviews",
  reviewsController.getProductReviews.bind(reviewsController)
);

router.get(
  "/products/:productId/reviews/stats",
  reviewsController.getProductReviewsStats.bind(reviewsController)
);

router.get(
  "/users/reviews",
  authMiddleware(["user", "admin"]),
  reviewsController.getUserReviews.bind(reviewsController)
);

router.post(
  "/products/:productId/reviews",
  authMiddleware(["user", "admin"]),
  reviewsController.createReview.bind(reviewsController)
);

router.patch(
  "/reviews/:reviewId/status",
  authMiddleware(["admin"]),
  reviewsController.updateReviewStatus.bind(reviewsController)
);

router.get(
  "/admin/reviews",
  authMiddleware(["admin"]),
  reviewsController.getAllReviews.bind(reviewsController)
);

router.get(
  "/reviews/:reviewId",
  authMiddleware(["user", "admin"]),
  reviewsController.getReviewById.bind(reviewsController)
);

module.exports = router;
