const Bull = require('bull');

const redis = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  connectTimeout: 180000,
};

const defaultJobOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,    
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

const emailQueues = new Bull('emailQueues', { redis, defaultJobOptions, settings, limiter });
const logQueues = new Bull('logQueues', { redis, defaultJobOptions, settings, limiter });
const errorLogQueues = new Bull('errorLogQueues', { redis, defaultJobOptions, settings, limiter });

emailQueues.on('error', (err) => {
  console.error('Ошибка очереди:', err);
});
logQueues.on('error', (err) => {
  console.error('Ошибка очереди логов:', err);
});
errorLogQueues.on('error', (err) => {
  console.error('Ошибка очереди логов ошибок:', err);
});

console.log('Queues initialized: taskQueues, logQueues, errorLogQueues');

module.exports = { emailQueues, logQueues, errorLogQueues };