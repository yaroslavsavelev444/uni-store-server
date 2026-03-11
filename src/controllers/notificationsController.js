import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import notificationsService from "../services/notificationsService.js";

const {
  getNotificationsService,
  markNotificationAsReadService,
  deleteNotificationsService,
  getUnreadCount: _getUnreadCount,
} = notificationsService;

const getNotifications = async (req, res, next) => {
  const userData = req.user;

  if (!userData) {
    throw ApiError.BadRequest("Недостаточно данных для запроса.");
  }
  try {
    const notifications = await getNotificationsService(
      userData,
      Number(req.query.limit) || 10,
      Number(req.query.skip) || 0,
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
    const notifications = await markNotificationAsReadService(ids, userData);
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
    const notifications = await deleteNotificationsService(userData);
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
    const count = await _getUnreadCount(userData);
    res.status(200).json(count);
  } catch (e) {
    next(e);
  }
};

export default {
  getNotifications,
  markNotificationAsRead,
  deleteNotifications,
  getUnreadCount,
};
