// controllers/notificationsController.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import {
  deleteNotificationsService,
  getNotificationsService,
  getUnreadCount,
  markNotificationAsReadService,
} from "../services/notificationsService.js";
import type {
  DeleteNotificationsReq,
  GetNotificationsReq,
  GetUnreadCountReq,
  MarkAsReadReq,
} from "../types/controllers/notifications-controller.js";

class NotificationsController {
  /**
   * Получение списка уведомлений пользователя с пагинацией.
   * GET /api/notifications?limit=10&skip=0
   */
  getNotifications = async (
    req: GetNotificationsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userData = req.user;

    if (!userData) {
      throw ApiError.BadRequest("Недостаточно данных для запроса.");
    }

    try {
      const limit = parseInt(String(req.query.limit ?? "10"), 10);
      const skip = parseInt(String(req.query.skip ?? "0"), 10);

      const notifications = await getNotificationsService(
        {
          id: userData.id,
        },
        limit,
        skip,
      );
      res.status(200).json(notifications);
    } catch (e) {
      next(e);
    }
  };

  /**
   * Отметить уведомления как прочитанные.
   * POST /api/notifications/mark-read
   */
  markNotificationAsRead = async (
    req: MarkAsReadReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { ids } = req.body;
    const userData = req.user;

    if (!userData || !ids) {
      throw ApiError.BadRequest("Недостаточно данных для запроса.");
    }

    try {
      const result = await markNotificationAsReadService(ids);
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  };

  /**
   * Удалить все уведомления пользователя.
   * DELETE /api/notifications
   */
  deleteNotifications = async (
    req: DeleteNotificationsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userData = req.user;
    if (!userData) {
      throw ApiError.BadRequest("Недостаточно данных для запроса.");
    }

    try {
      const result = await deleteNotificationsService({ id: userData.id });
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  };

  /**
   * Получить количество непрочитанных уведомлений.
   * GET /api/notifications/unread-count
   */
  getUnreadCount = async (
    req: GetUnreadCountReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userData = req.user;
    if (!userData) {
      throw ApiError.BadRequest("Недостаточно данных для запроса.");
    }

    try {
      const count = await getUnreadCount({ id: userData.id });
      res.status(200).json(count);
    } catch (e) {
      next(e);
    }
  };
}

export default new NotificationsController();
