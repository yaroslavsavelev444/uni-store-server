import { default as mongoose } from "mongoose";
import { error as _error, debug, info } from "../../logger/logger.js";
import { disconnect } from "../../redis/redis.client.js";
import { sendNotification } from "../../services/mailService.js";
import { createHealthServer } from "../../utils/workerHealth.js";
import {
	moderateQueues,
	pushNotificationsQueues,
	taskQueues,
} from "../bull.js";

const healthServer = createHealthServer(4000);

import { connectDB } from "../../config/mongo.js";
import sendPushNotificationCustom from "../../utils/sendPushNotification.js";
import "axios";
import "../../models/index.models.js";
import { moderateReview } from "../../services/reviewService.js";
import { processNotification } from "../../services/telegramNotifierService.js";

const initProcessors = async () => {
	await connectDB();

	taskQueues.process("sendEmailNotification", async (job, done) => {
		try {
			const { email, type, data } = job.data;

			if (!email || !type || !data) {
				throw new Error("Missing required email notification data");
			}

			await sendNotification({
				email,
				type,
				data,
			});

			info(`Email successfully sent to: ${email}`);
			done();
		} catch (error) {
			_error(`Error processing email notification (Job ID: ${job.id}):`, error);
			done(error);
		}
	});

	taskQueues.process("sendTelegramNotification", 5, async (job) => {
		try {
			const { message, level, metadata, options } = job.data;

			info(`Processing Telegram notification (Job ID: ${job.id})`);

			// Используем метод processNotification для отправки
			const result = await processNotification(
				message,
				level,
				metadata,
				options,
			);

			if (result === null) {
				debug(`Telegram notification ${job.id} was skipped (duplicate)`);
			} else {
				info(`Telegram notification ${job.id} sent successfully`);
			}
		} catch (error) {
			_error(
				`Error processing Telegram notification (Job ID: ${job.id}):`,
				error.message,
			);

			// Для rate limit ошибок делаем повторную попытку
			if (error.message.includes("Rate limit exceeded")) {
				// Задержка перед повторной попыткой
				await new Promise((resolve) => setTimeout(resolve, 2000));
				throw error; // Bull сделает retry
			}

			// Для других ошибок логируем и пропускаем после нескольких попыток
			if (job.attemptsMade >= job.opts.attempts - 1) {
				_error(
					`Telegram notification ${job.id} failed after ${job.attemptsMade} attempts:`,
					error,
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
			_error(`Error processing email notification (Job ID: ${job.id}):`, error);
			done(error);
		}
	});

	pushNotificationsQueues.process("sendPushNotification", 10, async (job) => {
		console.log("Mongo readyState:", mongoose.connection.readyState);

		const { title, body, data, options, dbSave, userId } = job.data;

		console.log(`Processing push notification job ${job.id}`);

		try {
			await sendPushNotificationCustom(
				title,
				body,
				data,
				options,
				dbSave,
				userId,
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

info("Worker: Initialized");
