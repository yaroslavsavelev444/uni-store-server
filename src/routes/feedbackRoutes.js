// routes/feedback.js
const express = require("express");
const router = express.Router();
const feedbackController = require("../controllers/feedbackController");
const authMiddleware = require("../middlewares/auth-middleware");
const { createRedisRateLimiter } = require("../middlewares/rateLimit");

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
  authMiddleware(['all']),
  feedbackController.submitFeedback
);

router.get(
  "/:id",
  authMiddleware(['all']),
  feedbackController.getFeedback
);


// Админские роуты (только для админов и модераторов)
router.get(
  "/",
  authMiddleware(['admin']),
  feedbackController.getAllFeedbacks
);

router.patch(
  "/:id/status",
  authMiddleware(['admin']),
  feedbackController.updateStatus
);

router.patch(
  "/:id/priority",
  authMiddleware(['admin']),
  feedbackController.updatePriority
);


router.post(
  "/:id/notes",
  authMiddleware(['admin']),
  feedbackController.addInternalNote
);

router.patch(
  "/:id/notes/:noteId",
  authMiddleware(['admin']),
  feedbackController.updateInternalNote
);

router.delete(
  "/:id/notes/:noteId",
  authMiddleware(['admin']),
  feedbackController.deleteInternalNote
);

router.post(
  "/:id/tags",
  authMiddleware(['admin']),
  feedbackController.addTag
);

router.delete(
  "/:id/tags/:tag",
  authMiddleware(['admin']),
  feedbackController.removeTag
);

router.post(
  "/:id/duplicate",
  authMiddleware(['admin']),
  feedbackController.markAsDuplicate
);

router.delete(
  "/:id",
  authMiddleware(['admin']),
  feedbackController.deleteFeedback
);

// Статистика (для админов)
router.get(
  "/stats/admin",
  authMiddleware(['admin']),
  feedbackController.getAdminStats
);

router.get(
  "/stats/user",
  authMiddleware(['all']),
  feedbackController.getUserStats
);

// Экспорт (для админов)
router.get(
  "/export/csv",
  authMiddleware(['admin']),
  feedbackController.exportToCSV
);

module.exports = router;