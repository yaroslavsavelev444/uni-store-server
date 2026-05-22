const express = require("express");
const router = express.Router();
const TopicController = require("../controllers/topicController");
const multerSlugMiddleware = require("../middlewares/multerSlugMiddleware");
const authMiddleware = require("../middlewares/auth-middleware");

// Инициализация контроллера
const topicController = new TopicController();

// ==== Публичные маршруты ====
router.get("/", topicController.getAll.bind(topicController));
router.get("/:slug", topicController.getBySlug.bind(topicController));

// ==== Административные маршруты ====
router.post("/", authMiddleware(["admin"]), multerSlugMiddleware, topicController.create.bind(topicController));
router.patch("/:id", authMiddleware(["admin"]), multerSlugMiddleware, topicController.update.bind(topicController));
router.delete("/:id", authMiddleware(["admin"]), topicController.delete.bind(topicController));

module.exports = router;