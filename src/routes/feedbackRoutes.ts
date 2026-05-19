// routes/feedback.js
import { Router } from "express";

const router = Router();

import {
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
} from "../controllers/feedbackController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Лимитер для отправки фидбека (5 запросов в час на пользователя)
// const feedbackSubmitLimiter = createRedisRateLimiter({
//   keyPrefix: "feedback:submit",
//   windowSec: 3600, // 1 час
//   getMax: () => 5,
//   keyGenerator: (req) => req.user?.id || req.ip
// });

// Пользовательские роуты
router.post("/create", authMiddleware.requireAuth, submitFeedback);

router.get("/:id", authMiddleware.requireAuth, getFeedback);

// Админские роуты (только для админов и модераторов)
router.get("/", authMiddleware(["admin"]), getAllFeedbacks);

router.patch("/:id/status", authMiddleware(["admin"]), updateStatus as any);

router.patch("/:id/priority", authMiddleware(["admin"]), updatePriority as any);

router.post("/:id/notes", authMiddleware(["admin"]), addInternalNote as any);

router.patch(
  "/:id/notes/:noteId",
  authMiddleware(["admin"]),
  updateInternalNote as any,
);

router.delete(
  "/:id/notes/:noteId",
  authMiddleware(["admin"]),
  deleteInternalNote as any,
);

router.post("/:id/tags", authMiddleware(["admin"]), addTag as any);

router.delete("/:id/tags/:tag", authMiddleware(["admin"]), removeTag as any);

router.post(
  "/:id/duplicate",
  authMiddleware(["admin"]),
  markAsDuplicate as any,
);

router.delete("/:id", authMiddleware(["admin"]), deleteFeedback as any);

// Статистика (для админов)
router.get("/stats/admin", authMiddleware(["admin"]), getAdminStats);

router.get("/stats/user", authMiddleware.requireAuth, getUserStats);

// Экспорт (для админов)
router.get("/export/csv", authMiddleware(["admin"]), exportToCSV);

export default router;
