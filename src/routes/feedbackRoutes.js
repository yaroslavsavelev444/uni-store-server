// routes/feedback.js
import { Router } from "express";

const router = Router();

import feedbackController from "../controllers/feedbackController.js";

const {
  addInternalNote,
  addTag,
  deleteFeedback,
  deleteInternalNote,
  exportToCSV,
  getAdminStats,
  getAllFeedbacks,
  getFeedback,
  getUserStats,
  markAsDuplicate,
  removeTag,
  submitFeedback,
  updateInternalNote,
  updatePriority,
  updateStatus,
} = feedbackController;

import authMiddleware from "../middlewares/auth-middleware.js";

// Лимитер для отправки фидбека (5 запросов в час на пользователя)
// const feedbackSubmitLimiter = createRedisRateLimiter({
//   keyPrefix: "feedback:submit",
//   windowSec: 3600, // 1 час
//   getMax: () => 5,
//   keyGenerator: (req) => req.user?.id || req.ip
// });

// Пользовательские роуты
router.post("/create", authMiddleware(["all"]), submitFeedback);

router.get("/:id", authMiddleware(["all"]), getFeedback);

// Админские роуты (только для админов и модераторов)
router.get("/", authMiddleware(["admin"]), getAllFeedbacks);

router.patch("/:id/status", authMiddleware(["admin"]), updateStatus);

router.patch("/:id/priority", authMiddleware(["admin"]), updatePriority);

router.post("/:id/notes", authMiddleware(["admin"]), addInternalNote);

router.patch(
  "/:id/notes/:noteId",
  authMiddleware(["admin"]),
  updateInternalNote,
);

router.delete(
  "/:id/notes/:noteId",
  authMiddleware(["admin"]),
  deleteInternalNote,
);

router.post("/:id/tags", authMiddleware(["admin"]), addTag);

router.delete("/:id/tags/:tag", authMiddleware(["admin"]), removeTag);

router.post("/:id/duplicate", authMiddleware(["admin"]), markAsDuplicate);

router.delete("/:id", authMiddleware(["admin"]), deleteFeedback);

// Статистика (для админов)
router.get("/stats/admin", authMiddleware(["admin"]), getAdminStats);

router.get("/stats/user", authMiddleware(["all"]), getUserStats);

// Экспорт (для админов)
router.get("/export/csv", authMiddleware(["admin"]), exportToCSV);

export default router;
