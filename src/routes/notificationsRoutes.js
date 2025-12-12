const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');

router.get('/getNotifications', notificationsController.getNotifications);
router.get('/getUnreadCount', notificationsController.getUnreadCount);

router.put('/markNotificationsAsRead', notificationsController.markNotificationAsRead);
router.delete('/deleteNotifications', notificationsController.deleteNotifications);

module.exports = router;

