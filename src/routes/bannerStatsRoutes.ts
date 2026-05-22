// bannerStatsRoutes.ts
import { Router } from "express";
import bannerStatsController from "../controllers/bannerStatsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

const router = Router();

router.use(authMiddleware.requireAuth());
// POST /:id/view – зафиксировать просмотр баннера
router.post(
  "/:id/view",

  bannerStatsController.markViewed as any,
);

// POST /:id/click – зафиксировать клик по баннеру
router.post("/:id/click", bannerStatsController.markClicked as any);

// POST /:id/dismiss – зафиксировать отклонение баннера
router.post("/:id/dismiss", bannerStatsController.markDismissed as any);

export default router;
