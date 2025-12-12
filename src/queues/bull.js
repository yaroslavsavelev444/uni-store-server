const Bull = require("bull");
const logger = require("../logger/logger");
const redis = require("../redis/redisConfig");
const defaultJobOptions = {
  removeOnComplete: 1000, // Удалять после 1000 задач
  removeOnFail: 5000, // Оставлять последние 5000 ошибок для анализа
};

const limiter = {
  max: 10000,
  duration: 1000,
  bounceBack: false,
};

const settings = {
  lockDuration: 600000, // время истечения ключа блокировки задачи.
  stalledInterval: 5000, // интервал проверки застрявших задач.
  maxStalledCount: 5, // максимальное количество повторений застрявших задач.
  guardInterval: 5000, // интервал для опроса отложенных задач.
  retryProcessDelay: 30000, // задержка перед обработкой следующей задачи в случае ошибки.
  drainDelay: 60, // задержка перед завершением, когда очередь пуста.
};

const taskQueues = new Bull("taskQueues", {
  redis,
  defaultJobOptions,
  settings,
  limiter,
});


const moderateQueues = new Bull("moderateQueues", {
  redis,
  defaultJobOptions,
  settings,
  limiter,
});

const pushNotificationsQueues = new Bull("pushNotificationsQueues", {
  redis,
  defaultJobOptions,
  settings,
  limiter,
});


taskQueues
  .on('completed', job => logger.debug(`Job ${job.id} completed`))
  .on('failed', (job, err) => logger.error(`Job ${job.id} failed: ${err.message}`));

moderateQueues
  .on('completed', job => logger.debug(`Job ${job.id} completed`))
  .on('failed', (job, err) => logger.error(`Job ${job.id} failed: ${err.message}`));

pushNotificationsQueues
  .on('completed', job => logger.debug(`Job ${job.id} completed`))
  .on('failed', (job, err) => logger.error(`Job ${job.id} failed: ${err.message}`));

process.on('SIGTERM', async () => {
  await taskQueues.close();
  await moderateQueues.close();
  await pushNotificationsQueues.close();
  logger.info('Task queue closed');
});

logger.info("Queues initialized: taskQueues, moderateQueues, pushNotificationsQueues");

module.exports = { taskQueues, moderateQueues, pushNotificationsQueues };
