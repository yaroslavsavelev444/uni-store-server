const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
const notificationsService = require("../services/notificationsService");

const getNotifications = async (req, res, next) => {
  const userData = req.user;

  if (!userData) {
    throw ApiError.BadRequest("Недостаточно данных для запроса.");
  }
  try {
    const notifications = await notificationsService.getNotificationsService(
      userData,
      Number(req.query.limit) || 10,
      Number(req.query.skip) || 0
    );
    logger.info("notifications", notifications);
    res.status(200).json(notifications);
  } catch (e) {
    next(e);
  }
};

const markNotificationAsRead = async (req, res, next) => {
  const { ids } = req.body;
  const userData = req.user;

  if (!userData || !ids) {
    throw ApiError.BadRequest("Недостаточно данных для запроса.");
  }
  try {
    const notifications =
      await notificationsService.markNotificationAsReadService(ids, userData);
    logger.info("notifications", notifications);
    res.status(200).json(notifications);
  } catch (e) {
    next(e);
  }
};

const deleteNotifications = async (req, res, next) => {
  const userData = req.user;
  if (!userData) {
    throw ApiError.BadRequest("Недостаточно данных для запроса.");
  }
  try {
    const notifications = await notificationsService.deleteNotificationsService(
      userData
    );
    res.status(200).json(notifications);
  } catch (e) {
    next(e);
  }
};

const getUnreadCount = async (req, res, next) => {
  const userData = req.user;
  if (!userData) {
    throw ApiError.BadRequest("Недостаточно данных для запроса.");
  }
  try {
    const count = await notificationsService.getUnreadCount(userData);
    res.status(200).json(count);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getNotifications,
  markNotificationAsRead,
  deleteNotifications,
  getUnreadCount
};
