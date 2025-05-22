
const ApiError = require('../exceptions/api-error');
const { emailQueues , logQueues, errorLogQueues } = require('./bull');
require('dotenv').config();
const path = require("path");

const errorLogPath = path.resolve(
  __dirname,
  "../logs/error.log");

// Отправка на почту 
async function sendEmailNotification(email, type, data, tg = false) {
  
  console.log("sendEmailNotification" , email, type, data);
  if(!email || !type || !data) {
    console.log('Отсутствуют обязательные данные');
    throw ApiError.BadRequest('Отсутствуют обязательные данные');
  }

  try {
    const job = await emailQueues.add("sendEmailNotification", {
      email,
      type,
      data,
      tg
    });
    console.log(`Task added to queue: ${job.id}`);
  } catch (error) {
    console.error("Error sending email notification:", error);
    throw ApiError.InternalServerError("Error sending email notification");
  }
}


//Запись логов в файл или бд

async function writeLogs( logFilePath, logEntry) {
  console.log('logFilePath, logEntry', logFilePath, logEntry);

  if (!logFilePath || !logEntry || Object.keys(logEntry).length === 0) {
    console.log('Ошибка: отсутствуют обязательные данные для логирования.');
    throw ApiError.BadRequest("Ошибка: отсутствуют обязательные данные.");
  }

  // Запись логов в файл или бд
  try {
    await logQueues.add("sendLogs", { logFilePath, logEntry });
  } catch (error) {
      console.error("Ошибка при добавлении задачи в очередь логирования:", error);
      throw ApiError.InternalServerError("Ошибка при добавлении задачи в очередь логирования.");
  }

}

async function writeErrorLogs(logEntry, isCritical) {

  if (!errorLogPath || !logEntry || Object.keys(logEntry).length === 0) {
    console.log('Ошибка: отсутствуют обязательные данные для логирования.');
    throw ApiError.BadRequest("Ошибка: отсутствуют обязательные данные.");
  }

  // Запись логов в файл или бд
  try {
    await errorLogQueues.add("sendLogErrors", { errorLogPath, logEntry, isCritical });
  } catch (error) {
      console.error("Ошибка при добавлении задачи в очередь логирования:", error);
      throw ApiError.InternalServerError("Ошибка при добавлении задачи в очередь логирования.");
  }

}



module.exports = {  sendEmailNotification , writeLogs, writeErrorLogs};