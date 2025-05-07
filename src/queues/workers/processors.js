const mailService = require("../../services/mailService");
const { sendTelegramAlert } = require("../../utils/telegramNotifier");
const { logQueues, errorLogQueues, emailQueues } = require("../bull");
const fs = require("fs");

emailQueues.process("sendEmailNotification", async (job) => {
  const { email, type, data } = job.data;
  if (!email || !type || !data) throw new Error("Missing required data");

  await mailService.sendNotification({ email, type, data });

  if (type === "newOrderAdmin") {
    await sendTelegramAlert(data);
  }

  console.log(`Email sent to ${email}`);
});

//Запись логов в файл или бд
logQueues.process("sendLogs", async (job) => {
  const { logFilePath, logEntry } = job.data;

  return new Promise((resolve, reject) => {
    fs.appendFile(logFilePath, JSON.stringify(logEntry) + "\n", (err) => {
      if (err) {
        console.error("Ошибка записи лога:", err);
        reject(err);
      } else {
        console.log("Лог записан:", logEntry);
        resolve();
      }
    });
  });
});

errorLogQueues.process("sendLogErrors", async (job) => {
  const { errorLogPath, logEntry, isCritical } = job.data;

  if (isCritical) {
    console.log("Critical error:", logEntry);

    const formattedLogEntry =
      typeof logEntry === "object"
        ? JSON.stringify(logEntry, null, 2)
        : logEntry;
    const message = `🚨 *Критическая ошибка на сервере!*  
📝 *Ошибка:* \`${formattedLogEntry}\`  
⏳ *Время:* ${new Date().toLocaleString()}`;

    await sendTelegramAlert(message);
  }

  return new Promise((resolve, reject) => {
    fs.appendFile(errorLogPath, JSON.stringify(logEntry) + "\n", (err) => {
      if (err) {
        console.error("Ошибка записи лога:", err);
        reject(err);
      } else {
        console.log("Лог записан:", logEntry);
        resolve();
      }
    });
  });
});
