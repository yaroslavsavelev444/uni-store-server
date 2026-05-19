import { Router } from "express";

const router = Router();

import bannerController from "../controllers/bannerController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Публичный роут для пользователей
router.get(
  "/for-user",
  authMiddleware.requireAuth,
  bannerController.getForUser,
);

// Админские роуты
router.use(authMiddleware.requireRole("admin"));

router.post("/", bannerController.create);
router.put("/:id", bannerController.update);
router.get("/", bannerController.getAll);
router.get("/:id", bannerController.getById);
router.delete("/:id", bannerController.remove);
router.patch("/:id/status", bannerController.changeStatus);

export default router;
