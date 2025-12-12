const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
require("../models/index.models");
const {
  taskQueues,
  moderateQueues,
  pushNotificationsQueues,
} = require("./bull");

async function sendEmailNotification(email, type, data) {
  logger.info(
    `sendEmailNotificationLetter: ${JSON.stringify(
      { email, type, data },
      null,
      2
    )}`
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

async function sendPushNotification({
  title,
  body,
  data = {},
  options = {},
  dbSave,
  userId,
  delay = 0,
  jobId = null,
}) {
  console.log(
    title,
    body,
    data,
    options,
    dbSave,
    userId,
    delay,
    jobId
  );

  try {
    const jobOptions = {
      // removeOnComplete: true,
      // removeOnFail: true,
    };

    if (delay && typeof delay === "number" && delay > 0) {
      jobOptions.delay = delay;
    }

    if (jobId) {
      jobOptions.jobId = jobId;
    }

    await pushNotificationsQueues.add(
      "sendPushNotification",
      {  title, body, data, options, dbSave, userId },
      jobOptions
    );
  } catch (error) {
    console.log("Ошибка при отправке пуш-уведомления:", error);
    throw ApiError.InternalServerError("Ошибка при отправке пуш-уведомления.");
  }
}

async function reviewModerate(reviewId) {
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

async function sendTelegramNotification(
  message,
  level = "error",
  metadata = {},
  options = {}
) {
  try {
    const job = await taskQueues.add("sendTelegramNotification", {
      message,
      level,
      metadata,
      options,
    });
    logger.info(`Telegram notification task added to queue: ${job.id}`);
    return job.id;
  } catch (error) {
    logger.error("Error queueing Telegram notification:", error);
    return null;
  }
}

module.exports = {
  sendEmailNotification,
  sendPushNotification,
  reviewModerate,
  sendTelegramNotification,
};
