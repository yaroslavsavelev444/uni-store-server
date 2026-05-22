// utils/createSystemNotification.ts
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { createNotification } from "../services/notificationsService.js";
import type {
  CreateNotificationParams,
  PushNotificationOption,
} from "../types/notification.js";

/**
 * Создание и сохранение уведомления в БД
 * @param title - заголовок уведомления
 * @param body - текст уведомления
 * @param data - дополнительные данные (передаются в приложение)
 * @param options - расширенные опции уведомления
 * @param dbSave - сохранять ли уведомление в БД
 * @param userId - пользователь, которому отправляется уведомление
 */

async function sendPushNotificationCustom(
  title: string,
  body: string,
  data: Record<string, any> = {},
  options: PushNotificationOption = {},
  dbSave: boolean = true,
  userId: string,
): Promise<boolean> {
  logger.info(
    `sendPushNotificationCustom: ${JSON.stringify(
      { title, body, data, options, dbSave, userId },
      null,
      2,
    )}`,
  );

  try {
    if (dbSave) {
      try {
        const notificationData: CreateNotificationParams = {
          userId,
          title,
          body,
          data,
          type: data?.type || "system",
        };

        await createNotification(notificationData);
        logger.info({
          msg: "Уведомление успешно сохранено в БД",
          notificationData,
        });
      } catch (error) {
        logger.error({
          msg: "Ошибка при сохранении уведомления в БД",
          error: (error as Error).message,
          notificationData: { title, body, data, userId },
        });
        throw ApiError.InternalServerError("Error saving notification");
      }
    }

    return true;
  } catch (error) {
    logger.error({
      msg: "Ошибка в sendPushNotificationCustom",
      error: (error as Error).message,
      input: { title, body, data, options, dbSave, userId },
    });
    throw error;
  }
}

export default sendPushNotificationCustom;
