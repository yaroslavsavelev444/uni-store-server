import { Router } from "express";

const router = Router();

import notificationsController from "../controllers/notificationsController.js";

router.get("/getNotifications", notificationsController.getNotifications);
router.get("/getUnreadCount", notificationsController.getUnreadCount);

router.put(
	"/markNotificationsAsRead",
	notificationsController.markNotificationAsRead,
);
router.delete(
	"/deleteNotifications",
	notificationsController.deleteNotifications,
);

export default router;
