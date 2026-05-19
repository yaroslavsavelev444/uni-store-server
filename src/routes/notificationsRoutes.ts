const express = require("express");
const router = express.Router();
const notificationsController = require("../controllers/notificationsController.js");

router.get("/getNotifications", notificationsController.getNotifications);
router.get("/getUnreadCount", notificationsController.getUnreadCount);

import {
  deleteNotifications,
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
} from "../controllers/notificationsController.js";

export default router;
