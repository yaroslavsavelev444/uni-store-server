// routes/feedback.js
import { Router } from "express";

const router = Router();

import feedbackController from "../controllers/feedbackController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Лимитер для отправки фидбека (5 запросов в час на пользователя)
// const feedbackSubmitLimiter = createRedisRateLimiter({
//   keyPrefix: "feedback:submit",
//   windowSec: 3600, // 1 час
//   getMax: () => 5,
//   keyGenerator: (req) => req.user?.id || req.ip
// });

// Пользовательские роуты
router.post(
  "/create",
  authMiddleware.requireAuth,
  feedbackController.submitFeedback,
);

router.get("/:id", authMiddleware.requireAuth, feedbackController.getFeedback);

// Админские роуты (только для админов и модераторов)
router.get("/", authMiddleware(["admin"]), feedbackController.getAllFeedbacks);

router.patch(
  "/:id/status",
  authMiddleware(["admin"]),
  feedbackController.updateStatus,
);

router.patch(
  "/:id/priority",
  authMiddleware(["admin"]),
  feedbackController.updatePriority,
);

router.post(
  "/:id/notes",
  authMiddleware(["admin"]),
  feedbackController.addInternalNote,
);

router.patch(
  "/:id/notes/:noteId",
  authMiddleware(["admin"]),
  feedbackController.updateInternalNote,
);

router.delete(
  "/:id/notes/:noteId",
  authMiddleware(["admin"]),
  feedbackController.deleteInternalNote,
);

router.post("/:id/tags", authMiddleware(["admin"]), feedbackController.addTag);

router.delete(
  "/:id/tags/:tag",
  authMiddleware(["admin"]),
  feedbackController.removeTag,
);

router.post(
  "/:id/duplicate",
  authMiddleware(["admin"]),
  feedbackController.markAsDuplicate,
);

router.delete(
  "/:id",
  authMiddleware(["admin"]),
  feedbackController.deleteFeedback,
);

// Статистика (для админов)
router.get(
  "/stats/admin",
  authMiddleware(["admin"]),
  feedbackController.getAdminStats,
);

router.get(
  "/stats/user",
  authMiddleware.requireAuth,
  feedbackController.getUserStats,
);

// Экспорт (для админов)
router.get(
  "/export/csv",
  authMiddleware(["admin"]),
  feedbackController.exportToCSV,
);

export default router;
