import { Router } from "express";

const router = Router();

import TopicController from "../controllers/topicController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import multerSlugMiddleware from "../middlewares/multerSlugMiddleware.js";

// Инициализация контроллера
const topicController = new TopicController();

// ==== Публичные маршруты ====
router.get("/", topicController.getAll.bind(topicController));
router.get("/:slug", topicController.getBySlug.bind(topicController));

// ==== Административные маршруты ====
router.post(
	"/",
	authMiddleware(["admin"]),
	multerSlugMiddleware,
	topicController.create.bind(topicController),
);
router.patch(
	"/:id",
	authMiddleware(["admin"]),
	multerSlugMiddleware,
	topicController.update.bind(topicController),
);
router.delete(
	"/:id",
	authMiddleware(["admin"]),
	topicController.delete.bind(topicController),
);

export default router;
