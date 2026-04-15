const { AccountDeletionRequestModel } = require("../models/index.models");
const { processAccountDeletion } = require("./processAccountDeletionService"); // логика удаления/анонимизации
const logger = require("../logger/logger");

class AccountDeletionService {
  /**
   * Создать заявку на удаление аккаунта
   */
  async createDeletionRequest(userId, reason) {
    // Проверка на существующую активную заявку
    const existing = await AccountDeletionRequestModel.findOne({
      user: userId,
      status: "pending",
    });
    if (existing) {
      throw new Error(
        "Заявка на удаление аккаунта уже существует и обрабатывается.",
      );
    }

    const request = new AccountDeletionRequestModel({
      user: userId,
      reason: reason || undefined,
      status: "pending",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 дней
    });
    await request.save();
    return request;
  }

  /**
   * Получить все заявки (для админа)
   */
  async getAllRequests() {
    return await AccountDeletionRequestModel.find()
      .populate("user", "email name") // подтянуть данные пользователя
      .sort({ createdAt: -1 });
  }

  /**
   * Обрабатывает истекшие заявки (вызывается по расписанию)
   * @returns {Promise<number>} количество обработанных заявок
   */
  async processExpiredRequests() {
    const now = new Date();
    const expiredRequests = await AccountDeletionRequestModel.find({
      status: "pending",
      expiresAt: { $lt: now },
    });

    logger.info(`Найдено истекших заявок: ${expiredRequests.length}`);

    for (const request of expiredRequests) {
      try {
        // Запускаем удаление/анонимизацию данных пользователя
        await processAccountDeletion(request.user);
        request.status = "completed";
        await request.save();
        logger.info(
          `Заявка ${request._id} выполнена, пользователь ${request.user} удалён.`,
        );
      } catch (error) {
        logger.error(`Ошибка обработки заявки ${request._id}:`, error);
        request.status = "failed";
        await request.save();
      }
    }
    return expiredRequests.length;
  }

  /**
   * Отмена заявки (опционально)
   */
  async cancelRequest(userId) {
    const request = await AccountDeletionRequestModel.findOne({
      user: userId,
      status: "pending",
    });
    if (!request) {
      throw new Error("Активная заявка на удаление не найдена");
    }
    request.status = "cancelled";
    await request.save();
    return request;
  }
}

module.exports = new AccountDeletionService();
