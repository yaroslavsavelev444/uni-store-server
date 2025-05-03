const { default: axios } = require("axios");
const mailService = require("../../services/mailService");
const {
  handleRentalCompletion,
  startRentalService,
} = require("../../services/rentalService");
const { sendTelegramAlert } = require("../../utils/telegramNotifier");
const { taskQueues, logQueues, errorLogQueues, aiQueues, ratingQueues, orderQueues, pushNotificationsQueues } = require("../bull");
const { sendEmailNotification, sendPushNotification } = require("../taskQueues");
const fs = require("fs");
const { getReceiverSocketId, getIoInstance } = require("../../utils/socket");
const ApiError = require("../../exceptions/api-error");
const redis = require("redis");
const { RoomModel, UserModel } = require("../../models/indexModels");
const ordersService = require("../../services/ordersService");
const ratingService = require("../../services/ratingService");
const sendPushNotificationCustom = require("../../utils/sendPushNotification");

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

    console.log(`Email successfully sent to: ${email}`);
    done();
  } catch (error) {
    console.error(
      `Error processing email notification (Job ID: ${job.id}):`,
      error
    );
    done(error);
  }
});

taskQueues.process("startRental", async (job, done) => {
  const { rentalId } = job.data;
  console.log(`Starting rental: ${rentalId}`);

  try {
    const result = await startRentalService({ rentalId });
    if (result.error) {
      done(new Error(result.error)); // Ошибка передается в done
    } else {
      console.log(`Rental ${rentalId} started successfully`);
      done(); // Успешное выполнение
    }
  } catch (error) {
    console.error(`Error starting rental ${rentalId}:`, error);
    done(error); // Передаем ошибку явно
  }
});

taskQueues.process("endRental", async (job, done) => {
  let { rentalId } = job.data;
  console.log(`Ending rental: ${rentalId}`);
  try {
    const result = await handleRentalCompletion({
      rentalId,
      status: "completed",
    });

    if (result.error) {
      done(new Error(result.error)); // Ошибка передается в done
    } else {
      console.log(`Rental ${rentalId} started successfully`);
      done(); // Успешное выполнение
    }
  } catch (error) {
    console.error(`Error ending rental ${rentalId}:`, error);
    done(error);
  }
});

taskQueues.process("rental-reminder", async (job, done) => {
  try {
    const { rentalId, ownerEmail, renterEmail, milestone, startDate, endDate } =
      job.data;
    console.log(
      `Processing rental reminder: ${milestone} for rental ${rentalId}`
    );

    //Отправка владельцу
    await sendEmailNotification(ownerEmail, "rentalReminder", {
      rentalId,
      startDate,
      endDate,
      message: `Напоминание владельцу: ${milestone} срока аренды прошло.`,
    });

    //Отправка арендатору
    await sendEmailNotification(renterEmail, "rentalReminder", {
      rentalId,
      startDate,
      endDate,
      message: `🚗 Напоминание арендатору: ${milestone} срока аренды ${rentalId} прошло.`,
    });

    console.log(`Reminder email sent for rental ${rentalId} (${milestone})`);
    done();
  } catch (error) {
    console.error(
      `Error processing rental reminder (Job ID: ${job.id}):`,
      error
    );
    done(error);
  }
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

aiQueues.process('processAiMessage', 10, async (job) => {
  const { senderId, receiverId, text } = job.data;
  console.log(`Processing AI messageProcessor: ${text}`);
  try {
    const aiResponse = await axios.post("http://localhost:11434/api/generate", {
      model: "support-bot",
      prompt: text,
      stream: false,
    });

    const responseText = aiResponse.data?.response?.trim();
    console.log("AI response:", responseText);

    if (responseText) {
      const roomData = await RoomModel.findOne({ users: { $all: [senderId, receiverId] } });
      const botUser = await UserModel.findById(receiverId);
      const senderData = await UserModel.findById(senderId);
      if (!botUser || !roomData || !senderData) {
        throw ApiError.NotFoundError("Room or bot user not found");
      }

      // Создаем сообщение от бота
      const botMessage = roomData.messages.create({
        senderId: botUser._id,
        receiverId: senderId,
        text: responseText,
        createdAt: new Date(),
      });

      roomData.messages.push(botMessage);
      await roomData.save();

      // Отправляем ответ через сокет пользователю
      const userSocketId = getReceiverSocketId(senderId);
      if (userSocketId) {
        console.log("Sending message to user:", userSocketId);
        const io = getIoInstance();
        io.to(userSocketId).emit("newMessage", botMessage);
      }

      const publisher = redis.createClient();
      await publisher.connect();

      await publisher.publish("newMessage", JSON.stringify({ userId: senderId, message: botMessage }));

      await sendPushNotification(
        senderData.tokens.fcmToken,
        "AI ассистент",
        responseText,
        { screen: 'ChatScreen', orderId: '302' }, //TODO навигация по уведомлению
        {
          priority: 'high',
          ttl: 1800,
          badge: 5,
          sound: 'default',
        },
        false,
        senderId
      );
    }

  } catch (err) {
    console.error("Error calling AI API:", err.response?.data || err.message);
  }
});

ratingQueues.process('updateRating', 10, async (job) => {
  const { userData, reviewId, settedRating, actionType } = job.data;
  try {
    await ratingService.updateUserRating(userData, reviewId, settedRating, actionType);
  } catch (error) {
    console.log("Error updating user rating:", error);
  }
});

orderQueues.process('orderAutoSelect', 10, async (job) => {
  const { orderId, seletedParam } = job.data;
  try {
    await ordersService.autoAssignExecutor(orderId, seletedParam);
  } catch (error) {
    console.log("Error updating user rating:", error);
  }
});

orderQueues.process('cancelOrderAutoSelect', 10, async (job) => {
  const { orderId } = job.data;
  try {
    await ordersService.cancelAutoAssignExecutor(orderId);
  } catch (error) {
    console.log("Error updating user rating:", error);
  }
});

pushNotificationsQueues.process('sendPushNotification', 10, async (job) => {
  const { expoPushToken, title, body, data, options, dbSave, userId  } = job.data;
  try {
    await sendPushNotificationCustom(expoPushToken, title, body, data, options, dbSave, userId);
  } catch (error) {
    console.log("Error updating user rating:", error);
  }
});
