import { Router } from "express";

const router = Router();

import { markClicked, markDismissed, markViewed } from "../controllers/bannerStatsController";
import authMiddleware from "../middlewares/auth-middleware";

router.post("/:id/view", authMiddleware(["all"]), markViewed);
router.post("/:id/click", authMiddleware(["all"]), markClicked);
router.post("/:id/dismiss", authMiddleware(["all"]), markDismissed);

export default router;
