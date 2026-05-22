import { Router } from "express";
import topicController from "../controllers/topicController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

const router = Router();

// ==== Публичные маршруты ====
router.get("/", topicController.getAll);
router.get("/:slug", topicController.getBySlug);

// ==== Административные маршруты ====
router.post("/", authMiddleware(["admin"]), topicController.create as any);
router.patch("/:id", authMiddleware(["admin"]), topicController.update as any);
router.delete("/:id", authMiddleware(["admin"]), topicController.delete as any);

export default router;
