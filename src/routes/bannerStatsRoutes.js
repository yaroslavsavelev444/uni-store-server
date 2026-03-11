import { Router } from "express";

const router = Router();

import bannerStatsController from "../controllers/bannerStatsController";
import authMiddleware from "../middlewares/auth-middleware";

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
