const { emailQueues } = require("./bull");

const WORK_START_HOUR = 8;  // Начало работы
const WORK_END_HOUR = 22;   // Окончание работы
let isProcessing = false;   // Флаг активности обработки

function shouldProcessJobs() {
  const now = new Date();
  const currentHour = now.getHours();
  return currentHour >= WORK_START_HOUR && currentHour < WORK_END_HOUR;
}

async function startProcessing() {
  if (!isProcessing && shouldProcessJobs()) {
    console.log("Запуск обработки очереди...");

    // Включаем обработку задач
    emailQueues.process("*", async (job, done) => {
      console.log(`Обрабатываем задачу ${job.name} (ID: ${job.id})`);
      try {
        // Здесь выполняем задачу
        done();
      } catch (error) {
        console.error(`Ошибка обработки ${job.name} (ID: ${job.id}):`, error);
        done(error);
      }
    });

    isProcessing = true;
  }
}

function getTimeUntilNextWorkPeriod() {
    const now = new Date();
    const nextStart = new Date(now);
    nextStart.setHours(WORK_START_HOUR, 0, 0, 0);
  
    if (now.getHours() >= WORK_END_HOUR) {
      nextStart.setDate(nextStart.getDate() + 1);
    }
  
    return nextStart.getTime() - now.getTime();
  }


async function stopProcessing() {
  if (isProcessing && !shouldProcessJobs()) {
    console.log("Остановка обработки очереди...");
    
    // Завершаем обработку задач
    await emailQueues.close();
    isProcessing = false;
  }
}

// Планируем проверку каждую минуту
setInterval(() => {
  if (shouldProcessJobs()) {
    startProcessing();
  } else {
    stopProcessing();
  }
}, 60 * 1000);

module.exports = { startProcessing, stopProcessing, shouldProcessJobs, getTimeUntilNextWorkPeriod };