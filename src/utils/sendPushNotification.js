const ApiError = require("../exceptions/api-error");
const { NotificationModel } = require("../models/index.models");
const logger = require("../logger/logger");
const { createNotification } = require("../services/notificationsService");

/**
 * Отправка пуш-уведомления
 * @param {string} title - заголовок уведомления
 * @param {string} body - текст уведомления
 * @param {object} data - дополнительные данные (передаются в приложение)
 * @param {object} options - расширенные опции уведомления
 * @param {boolean} dbSave - сохранять ли уведомление в БД
 * @param {string|ObjectId} userId - пользователь, которому отправляется уведомление
 */
async function sendPushNotificationCustom(
  title,
  body,
  data = {},
  options = {},
  dbSave = true,
  userId
) {

  logger.info(
    `sendPushNotificationCustom: ${JSON.stringify(
      { title, body, data, options, dbSave, userId },
      null,
      2
    )}`
  );
  const message = {
    sound: options.sound || "default",
    title,
    body,
    data,
    priority: options.priority || "high",
    ttl: options.ttl || 60 * 60,
    badge: options.badge || undefined,
    subtitle: options.subtitle,
    channelId: options.channelId,
  };

  try {
    // const ticketChunk = await expo.sendPushNotificationsAsync([message]);

    // const ticket = ticketChunk?.[0];

    if (dbSave) {
      // console.log("Saving notification to DB...", { userId, title });

      // const pushStatusMap = {
      //   ok: "sent",
      //   error: "failed",
      //   unknown: "pending",
      // };

      // const pushStatus = pushStatusMap[ticket?.status] || "pending";

      // const pushStatus = "pending";

      try {
        await createNotification({
          userId,
          title,
          body,
          data,
          type: data?.type || "system",
        });
        console.log("Notification saved");
      } catch (error) {
        console.error("❌ Ошибка при сохранении уведомления:", error);
        throw ApiError.InternalServerError("Error saving notification");
      }
    }

    return true;
  } catch (error) {
    console.log("Ошибка при отправке push:", error);
    throw error;
  }
}

module.exports = sendPushNotificationCustom;
