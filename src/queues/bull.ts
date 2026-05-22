import Bull, { type Job, type Queue, type QueueOptions } from "bull";
import logger from "../logger/logger.js";
import redis from "../redis/redisConfig.js";

/**
 * Настройки по умолчанию для всех задач.
 */
const defaultJobOptions: QueueOptions["defaultJobOptions"] = {
  removeOnComplete: 1000, // сохранять последние 1000 завершённых задач
  removeOnFail: 5000, // сохранять последние 5000 упавших задач
};

/**
 * Лимитер для контроля частоты обработки задач.
 */
const limiter: QueueOptions["limiter"] = {
  max: 10000, // максимум задач за интервал
  duration: 1000, // интервал в миллисекундах
  bounceBack: false,
};

/**
 * Дополнительные настройки очереди.
 */
const settings: QueueOptions["settings"] = {
  lockDuration: 600000, // время блокировки задачи (10 минут)
  stalledInterval: 5000, // интервал проверки зависших задач
  maxStalledCount: 5, // количество повторных попыток для зависших задач
  guardInterval: 5000, // интервал опроса отложенных задач
  retryProcessDelay: 30000, // задержка перед повторной обработкой при ошибке
  drainDelay: 60, // задержка перед завершением, если очередь пуста
};

const { enableReadyCheck, maxRetriesPerRequest, ...bullSafeRedisConfig } =
  redis;

/**
 * Общие параметры для всех очередей.
 */
const queueOptions: QueueOptions = {
  redis: bullSafeRedisConfig,
  defaultJobOptions,
  settings,
  limiter,
};

// ========== Очереди ==========
export const taskQueues: Queue = new Bull("taskQueues", queueOptions);
export const moderateQueues: Queue = new Bull("moderateQueues", queueOptions);
export const pushNotificationsQueues: Queue = new Bull(
  "pushNotificationsQueues",
  queueOptions,
);

// ========== Обработчики событий ==========
taskQueues
  .on("completed", (job: Job) => logger.debug(`Job ${job.id} completed`))
  .on("failed", (job: Job, err: Error) =>
    logger.error(`Job ${job.id} failed: ${err.message}`),
  );

moderateQueues
  .on("completed", (job: Job) => logger.debug(`Job ${job.id} completed`))
  .on("failed", (job: Job, err: Error) =>
    logger.error(`Job ${job.id} failed: ${err.message}`),
  );

pushNotificationsQueues
  .on("completed", (job: Job) => logger.debug(`Job ${job.id} completed`))
  .on("failed", (job: Job, err: Error) =>
    logger.error(`Job ${job.id} failed: ${err.message}`),
  );

// ========== Graceful shutdown ==========
process.on("SIGTERM", async () => {
  await Promise.all([
    taskQueues.close(),
    moderateQueues.close(),
    pushNotificationsQueues.close(),
  ]);
  logger.info("All task queues closed gracefully");
});

logger.info(
  "Queues initialized: taskQueues, moderateQueues, pushNotificationsQueues",
);
