import type { JobOptions } from "bull";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import type { EmailDataMap } from "../services/mailService.js";
import type { EmailType } from "../types/email.types.js";
import { moderateQueues, pushNotificationsQueues, taskQueues } from "./bull.js";

/**
 * Отправка email-уведомления через очередь
 */
export async function sendEmailNotification<T extends EmailType>(
  email: string,
  type: T,
  data: EmailDataMap[T],
): Promise<void> {
  logger.info(
    `sendEmailNotificationLetter: ${JSON.stringify({ email, type, data }, null, 2)}`,
  );

  if (!email || !type || !data) {
    logger.info("Отсутствуют обязательные данные");
    throw ApiError.BadRequest("Отсутствуют обязательные данные");
  }

  try {
    const job = await taskQueues.add("sendEmailNotification", {
      email,
      type,
      data,
    });
    logger.info(`Task added to queue: ${job.id}`);
  } catch (error) {
    logger.error("Error sending email notification:", error);
    throw ApiError.InternalServerError("Error sending email notification");
  }
}

/**
 * Параметры для отправки push-уведомления
 */
export interface SendPushNotificationParams {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  dbSave?: boolean;
  userId?: string;
  delay?: number;
  jobId?: string | null;
}

/**
 * Отправка push-уведомления через очередь
 */
export async function sendPushNotification({
  title,
  body,
  data = {},
  options = {},
  dbSave,
  userId,
  delay = 0,
  jobId = null,
}: SendPushNotificationParams): Promise<void> {
  console.log(title, body, data, options, dbSave, userId, delay, jobId);

  try {
    const jobOptions: JobOptions = {};

    if (delay && typeof delay === "number" && delay > 0) {
      jobOptions.delay = delay;
    }

    if (jobId) {
      jobOptions.jobId = jobId;
    }

    await pushNotificationsQueues.add(
      "sendPushNotification",
      { title, body, data, options, dbSave, userId },
      jobOptions,
    );
  } catch (error) {
    console.log("Ошибка при отправке пуш-уведомления:", error);
    throw ApiError.InternalServerError("Ошибка при отправке пуш-уведомления.");
  }
}

/**
 * Постановка задачи на модерацию отзыва
 */
export async function reviewModerate(reviewId: string): Promise<void> {
  if (!reviewId) {
    throw ApiError.BadRequest("userId and reviewId are required");
  }

  try {
    const job = await moderateQueues.add("moderateReview", { reviewId });
    logger.info(`Task added: ${job.id}`);
  } catch (error) {
    logger.error("Error adding task:", error);
    throw ApiError.InternalServerError("Ошибка постановки задачи");
  }
}

/**
 * Параметры для Telegram-уведомления
 */
export interface SendTelegramNotificationParams {
  message: string;
  level?: string;
  metadata?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

/**
 * Отправка Telegram-уведомления через очередь
 * @returns ID задачи или null при ошибке
 */
export async function sendTelegramNotification(
  message: string,
  level: string = "error",
  metadata: Record<string, unknown> = {},
  options: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const job = await taskQueues.add("sendTelegramNotification", {
      message,
      level,
      metadata,
      options,
    });
    logger.info(`Telegram notification task added to queue: ${job.id}`);
    return job.id as string;
  } catch (error) {
    logger.error("Error queueing Telegram notification:", error);
    return null;
  }
}

// Экспорт по умолчанию для обратной совместимости
export default {
  sendEmailNotification,
  sendPushNotification,
  reviewModerate,
  sendTelegramNotification,
};
