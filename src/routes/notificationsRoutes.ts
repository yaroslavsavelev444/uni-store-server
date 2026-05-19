import express from "express";

const router = express.Router();

import notificationsController from "../controllers/notificationsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

router.use(authMiddleware.requireAuth);
router.get(
  "/getNotifications",
  notificationsController.getNotifications as any,
);
router.get("/getUnreadCount", notificationsController.getUnreadCount as any);

export default router;
