const express = require("express");
const router = express.Router();
const bannerStatsController = require("../controllers/bannerStatsController");
const authMiddleware = require("../middlewares/auth-middleware");

router.post(
  "/:id/view",
  authMiddleware(["all"]),
  bannerStatsController.markViewed,
);
router.post(
  "/:id/click",
  authMiddleware(["all"]),
  bannerStatsController.markClicked,
);
router.post(
  "/:id/dismiss",
  authMiddleware(["all"]),
  bannerStatsController.markDismissed,
);

import bannerStatsController from "../controllers/bannerStatsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

router.post(
  "/:id/view",
  authMiddleware(["all"]),
  bannerStatsController.markViewed,
);
router.post(
  "/:id/click",
  authMiddleware(["all"]),
  bannerStatsController.markClicked,
);
router.post(
  "/:id/dismiss",
  authMiddleware(["all"]),
  bannerStatsController.markDismissed,
);

export default router;
