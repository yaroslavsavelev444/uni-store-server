// bannerStatsRoutes.ts
import { Router } from "express";
import bannerStatsController from "../controllers/bannerStatsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

const router = Router();

// POST /:id/view – зафиксировать просмотр баннера
router.post(
  "/:id/view",
  authMiddleware.requireAuth,
  bannerStatsController.markViewed,
);

// POST /:id/click – зафиксировать клик по баннеру
router.post(
  "/:id/click",
  authMiddleware.requireAuth,
  bannerStatsController.markClicked,
);

// POST /:id/dismiss – зафиксировать отклонение баннера
router.post(
  "/:id/dismiss",
  authMiddleware.requireAuth,
  bannerStatsController.markDismissed,
);

export default router;
