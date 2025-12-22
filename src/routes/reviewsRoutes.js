const express = require("express");
const router = express.Router();
const reviewsController = require("../controllers/reviewsController");
const authMiddleware = require("../middlewares/auth-middleware");

router.post("/add/:id", authMiddleware(["user"]), reviewsController.add);
router.get("/", reviewsController.get);
router.get("/:id", authMiddleware(["all"]), reviewsController.getUserReviews);
router.patch("/update", authMiddleware(["admin"]), reviewsController.update);

module.exports = router;
