import { Router } from "express";

const router = Router();

import bannerController from "../controllers/bannerController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Публичный роут для пользователей
router.get(
  "/for-user",
  authMiddleware.requireAuth,
  bannerController.getForUser as any,
);

// Админские роуты
router.use(authMiddleware.requireRole("admin"));

router.post("/", bannerController.create as any);
router.put("/:id", bannerController.update as any);
router.get("/", bannerController.getAll as any);
router.get("/:id", bannerController.getById as any);
router.delete("/:id", bannerController.remove as any);
router.patch("/:id/status", bannerController.changeStatus as any);

export default router;
