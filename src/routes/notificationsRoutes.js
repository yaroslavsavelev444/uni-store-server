import { Router } from "express";

const router = Router();

import {
	deleteNotifications,
	getNotifications,
	getUnreadCount,
	markNotificationAsRead,
} from "../controllers/notificationsController.js";

router.get("/getNotifications", getNotifications);
router.get("/getUnreadCount", getUnreadCount);

router.put("/markNotificationsAsRead", markNotificationAsRead);
router.delete("/deleteNotifications", deleteNotifications);

export default router;
