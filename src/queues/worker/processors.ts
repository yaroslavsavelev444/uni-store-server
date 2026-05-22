import type { Job } from "bull";
import mongoose from "mongoose";
import { connectDB } from "../../config/mongo.js";
import logger from "../../logger/logger.js";
import redisClient from "../../redis/redis.client.js";
import { sendNotification } from "../../services/mailService.js";
// import { moderateReview } from "../../services/reviewService.js";
import telegramNotifierService, {
  type NotificationLevel,
} from "../../services/telegramNotifierService.js";
import sendPushNotificationCustom from "../../utils/sendPushNotification.js";
import { createHealthServer } from "../../utils/workerHealth.js";
import {
  moderateQueues,
  pushNotificationsQueues,
  taskQueues,
} from "../bull.js";

// ========== Типы данных для задач ==========
interface SendEmailNotificationData {
  email: string;
  type: string;
  data: Record<string, unknown>;
}

interface SendTelegramNotificationData {
  message: string;
  level: NotificationLevel;
  metadata?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

interface ModerateReviewData {
  reviewId: string;
}

interface SendPushNotificationData {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  dbSave?: boolean;
  userId?: string;
}

// ========== Health сервер ==========
const healthServer = createHealthServer(4000);

// ========== Инициализация обработчиков ==========
async function initProcessors(): Promise<void> {
  await connectDB();

  // Обработчик email уведомлений
  taskQueues.process(
    "sendEmailNotification",
    async (job: Job<SendEmailNotificationData>) => {
      const { email, type, data } = job.data;

      if (!email || !type || !data) {
        throw new Error("Missing required email notification data");
      }

      await sendNotification(email, type as any, data);
      logger.info(`Email successfully sent to: ${email}`);
    },
  );

  // Обработчик Telegram уведомлений (concurency = 5)
  taskQueues.process(
    "sendTelegramNotification",
    5,
    async (job: Job<SendTelegramNotificationData>) => {
      const { message, level, metadata, options } = job.data;

      if (!message || !level) {
        throw new Error("Missing required Telegram notification data");
      }
      logger.info(`Processing Telegram notification (Job ID: ${job.id})`);

      if (!message || !level || !metadata || !options) {
        throw new Error("Redis client is not initialized");
      }
      const result = await telegramNotifierService.processNotification(
        message,
        level,
        metadata,
        options,
      );

      if (result === null) {
        logger.debug(`Telegram notification ${job.id} was skipped (duplicate)`);
      } else {
        logger.info(`Telegram notification ${job.id} sent successfully`);
      }
    },
  );

  // Обработчик модерации отзывов
  moderateQueues.process(
    "moderateReview",
    async (job: Job<ModerateReviewData>) => {
      const { reviewId } = job.data;
      if (!reviewId) throw new Error("Missing required data: reviewId");
      // await moderateReview(reviewId);
    },
  );

  // Обработчик push-уведомлений (concurency = 10)
  pushNotificationsQueues.process(
    "sendPushNotification",
    10,
    async (job: Job<SendPushNotificationData>) => {
      console.log("Mongo readyState:", mongoose.connection.readyState);

      const { title, body, data, options, dbSave, userId } = job.data;

      if (!title || !body || !dbSave || !userId) {
        throw new Error("Missing required data: title, body");
      }
      console.log(`Processing push notification job ${job.id}`);

      await sendPushNotificationCustom(
        title,
        body,
        data,
        options,
        dbSave,
        userId,
      );
      console.log(`✅ Push notification job ${job.id} completed`);
    },
  );
}

// ========== Graceful shutdown ==========
async function shutdown(): Promise<void> {
  console.log("Shutting down worker...");

  // Закрываем соединения
  await mongoose.connection.close();
  await redisClient.disconnect();

  // Закрываем healthcheck сервер
  healthServer.close(() => {
    console.log("Health server closed");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ========== Запуск ==========
(async () => {
  try {
    await initProcessors();
    console.log("All processors initialized");

    // Помечаем воркер как готового к работе
    healthServer.setReady(true);
  } catch (err) {
    console.error("Worker initialization failed:", err);
    process.exit(1);
  }
})();

logger.info("Worker: Initialized");
