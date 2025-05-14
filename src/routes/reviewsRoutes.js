const express = require("express");
const router = express.Router();
const reviewsController = require("../controllers/reviewsController");
const authMiddleware = require("../middleware/auth-middleware");

router.post(
  "/addProductReview/:id",
  authMiddleware,
  reviewsController.addProductReview
);
router.post("/addOrgReview", authMiddleware, reviewsController.addOrgReview);
router.get("/getUserReviews", authMiddleware, reviewsController.getUserReviews);

router.get("/getOrgReviews", reviewsController.getOrgReviews);
router.get("/getProductReviews", reviewsController.getProductReviews);

module.exports = router;
