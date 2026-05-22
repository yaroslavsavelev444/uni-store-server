// routes/faq.routes.js
import { Router } from "express";
import faqController from "../controllers/faqController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

const router = Router();
// public
router.get("/", faqController.getPublicFaq);

// admin
router.use(authMiddleware.requireRole("admin"));

router.get("/admin", faqController.getAllFaqForAdmin as any);

router.post("/topics", faqController.createTopic as any);
router.put("/topics/:topicId", faqController.updateTopic as any);
router.delete("/topics/:topicId", faqController.deleteTopic as any);

router.post("/topics/:topicId/questions", faqController.addQuestion as any);
router.put(
  "/topics/:topicId/questions/:questionId",
  faqController.updateQuestion as any,
);
router.delete(
  "/topics/:topicId/questions/:questionId",
  faqController.deleteQuestion as any,
);

router.put("/reorder/topics", faqController.reorderTopics as any);
router.put(
  "/topics/:topicId/reorder/questions",
  faqController.reorderQuestions as any,
);

export default router;
