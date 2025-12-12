const mailService = require("../../services/mailService");
const logger = require("../../logger/logger");
const {
  taskQueues,
  moderateQueues,
  pushNotificationsQueues,
} = require("../bull");

const { createHealthServer } = require("../../utils/workerHealth");
const { disconnect } = require("../../redis/redis.client");
const { default: mongoose } = require("mongoose");
const healthServer = createHealthServer(4000);
const sendPushNotificationCustom = require("../../utils/sendPushNotification");
const { connectDB } = require("../../config/mongo");
require("axios");
require("../../models/index.models");
const { moderateReview } = require("../../services/reviewService");
const telegramNotifier = require("../../services/telegramNotifierService");

const initProcessors = async () => {
  await connectDB();

  taskQueues.process("sendEmailNotification", async (job, done) => {
    try {
      const { email, type, data } = job.data;

      if (!email || !type || !data) {
        throw new Error("Missing required email notification data");
      }

      await mailService.sendNotification({
        email,
        type,
        data,
      });

      logger.info(`Email successfully sent to: ${email}`);
      done();
    } catch (error) {
      logger.error(
        `Error processing email notification (Job ID: ${job.id}):`,
        error
      );
      done(error);
    }
  });

  taskQueues.process("sendTelegramNotification", 5, async (job) => {
    try {
      const { message, level, metadata, options } = job.data;

      logger.info(`Processing Telegram notification (Job ID: ${job.id})`);

      // Используем метод processNotification для отправки
      const result = await telegramNotifier.processNotification(
        message,
        level,
        metadata,
        options
      );

      if (result === null) {
        logger.debug(`Telegram notification ${job.id} was skipped (duplicate)`);
      } else {
        logger.info(`Telegram notification ${job.id} sent successfully`);
      }
    } catch (error) {
      logger.error(
        `Error processing Telegram notification (Job ID: ${job.id}):`,
        error.message
      );

      // Для rate limit ошибок делаем повторную попытку
      if (error.message.includes("Rate limit exceeded")) {
        // Задержка перед повторной попыткой
        await new Promise((resolve) => setTimeout(resolve, 2000));
        throw error; // Bull сделает retry
      }

      // Для других ошибок логируем и пропускаем после нескольких попыток
      if (job.attemptsMade >= job.opts.attempts - 1) {
        logger.error(
          `Telegram notification ${job.id} failed after ${job.attemptsMade} attempts:`,
          error
        );
      } else {
        throw error; // Пробрасываем для повторной попытки
      }
    }
  });

  moderateQueues.process("moderateReview", async (job, done) => {
    try {
      const { reviewId } = job.data;
      if (!reviewId) throw new Error("Missing required data");
      await moderateReview(reviewId);
      done();
    } catch (error) {
      logger.error(
        `Error processing email notification (Job ID: ${job.id}):`,
        error
      );
      done(error);
    }
  });

  pushNotificationsQueues.process("sendPushNotification", 10, async (job) => {
    console.log("Mongo readyState:", mongoose.connection.readyState);

    const {  title, body, data, options, dbSave, userId } =
      job.data;

    console.log(`Processing push notification job ${job.id}`);

    try {
      await sendPushNotificationCustom(
        title,
        body,
        data,
        options,
        dbSave,
        userId
      );

      console.log(`✅ Push notification job ${job.id} completed`);
      // Bull автоматически завершит job при успешном выполнении
    } catch (error) {
      console.error(`❌ Push notification job ${job.id} failed:`, error);
      throw error; // Важно пробросить ошибку для Bull
    }
  });
};

//4. Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down worker...");

  // Закрываем соединения
  await mongoose.connection.close();
  await disconnect();

  // Закрываем healthcheck сервер
  healthServer.close(() => {
    console.log("Health server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 5. Запуск
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
