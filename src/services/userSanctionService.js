// services/user-sanction-service.js (обновленная версия)
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import {
  UserModel,
  UserSanctionModel,
  UserSessionModel,
} from "../models/index.models.js"; // Добавили UserSessionModel
import redisClient from "../redis/redis.client.js"; // Импортируем redis
import SessionService from "../services/SessionService.js";

const { info, error: _error } = logger;
const {
  deleteAllUserSessions,
  getUserActiveSessions,
  bulkRemoveFromBlacklist,
} = SessionService;

// Деструктурируем нужные ошибки из ApiError
const { NotFoundError, BadRequest, DatabaseError, ForbiddenError } = ApiError;

class UserSanctionService {
  /**
   * Блокировка пользователя
   * @param {string} userId - ID пользователя для блокировки
   * @param {Object} admin - Объект админа, который блокирует
   * @param {Object} options - Опции блокировки
   * @returns {Promise<Object>} Созданная санкция
   */
  async blockUser(userId, admin, options = {}) {
    const session = await UserModel.db.startSession();

    try {
      session.startTransaction();

      const {
        duration = 24, // в часах
        reason = "Нарушение правил сообщества",
        type = "block",
        metadata = {},
      } = options;

      // Проверяем существование пользователя
      const user = await UserModel.findById(userId).session(session);
      if (!user) {
        throw new NotFoundError("Пользователь не найден"); // Добавил new
      }

      // Проверяем, не пытаемся ли заблокировать себя
      if (userId.toString() === admin.id.toString()) {
        throw new ApiError.BadRequest("Вы не можете заблокировать себя", []); // Добавил new
      }

      // Проверяем, не пытаемся ли заблокировать другого админа/суперадмина
      if (user.role === "admin" || user.role === "superadmin") {
        if (admin.role !== "superadmin") {
          throw new ForbiddenError(
            "Только суперадмин может блокировать администраторов", // Убрал null
          );
        }
      }

      // Деактивируем все предыдущие активные санкции
      await UserSanctionModel.updateMany(
        { user: userId, isActive: true },
        { isActive: false },
        { session },
      );

      // Рассчитываем expiresAt
      let expiresAt;
      if (duration === 0) {
        expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 лет
      } else {
        expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
      }

      // Создаем новую санкцию
      const sanction = new UserSanctionModel({
        user: userId,
        admin: admin.id,
        type,
        reason,
        duration,
        expiresAt,
        isActive: true,
        metadata: {
          ...metadata,
          adminName: admin.name,
          adminEmail: admin.email,
        },
      });

      await sanction.save({ session });

      // Обновляем статус пользователя
      user.status = "blocked";
      user.blockedUntil = sanction.expiresAt;
      user.lastSanction = sanction._id;
      await user.save({ session });

      // 🔴 КРИТИЧЕСКИ ВАЖНО: Инвалидируем ВСЕ сессии пользователя
      try {
        await deleteAllUserSessions(userId);
        info(`Все сессии пользователя ${userId} удалены при блокировке`, {
          userId,
          adminId: admin.id,
          duration,
        });
      } catch (sessionError) {
        _error(
          `Ошибка при удалении сессий пользователя ${userId}:`,
          sessionError,
        );
        // НЕ прерываем транзакцию, продолжаем блокировку
      }

      // 🔴 Добавляем все активные токены в blacklist
      try {
        // Получаем все активные сессии пользователя
        const activeSessions = await getUserActiveSessions(userId);

        if (activeSessions && activeSessions.length > 0) {
          // Используем bulkAddToBlacklist для массового добавления
          const refreshTokens = activeSessions.map((s) => s.refreshToken);

          // Создаем операции для pipeline
          const operations = refreshTokens.map((token) => {
            const blacklistKey = `blacklist:refresh:${token}`;
            const ttl =
              duration === 0
                ? 365 * 24 * 60 * 60 // 1 год для бессрочной блокировки
                : duration * 60 * 60; // Токены будут в blacklist пока действует блокировка
            return ["setex", blacklistKey, ttl, "user_blocked"];
          });

          // Выполняем массовое добавление в Redis
          await redisClient.pipeline(operations); // Используем импортированный redisClient

          info(`Токены пользователя ${userId} добавлены в blacklist`, {
            userId,
            tokensCount: refreshTokens.length,
            duration: duration === 0 ? "permanent" : `${duration} hours`,
          });
        }
      } catch (blacklistError) {
        _error(
          `Ошибка при добавлении токенов в blacklist для пользователя ${userId}:`,
          blacklistError,
        );
        // НЕ прерываем транзакцию
      }

      await session.commitTransaction();

      // Заполняем связанные данные (вне транзакции)
      const populatedSanction = await UserSanctionModel.findById(sanction._id)
        .populate("user", "name email role status")
        .populate("admin", "name email role")
        .lean();

      info(`Пользователь ${userId} успешно заблокирован`, {
        userId,
        adminId: admin.id,
        duration,
        expiresAt: sanction.expiresAt,
        type,
      });

      return populatedSanction;
    } catch (error) {
      await session.abortTransaction();

      if (error instanceof ApiError) {
        throw error;
      }

      _error(`Ошибка при блокировке пользователя ${userId}:`, error);
      throw new DatabaseError(
        // Добавил new
        `Ошибка при блокировке пользователя: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Разблокировка пользователя
   * @param {string} userId - ID пользователя для разблокировки
   * @param {Object} admin - Объект админа, который разблокирует
   * @returns {Promise<Object>} Обновленный пользователь
   */
  async unblockUser(userId, admin) {
    const session = await UserModel.db.startSession();

    try {
      session.startTransaction();

      const user = await UserModel.findById(userId).session(session);
      if (!user) {
        throw new NotFoundError("Пользователь не найден"); // Добавил new
      }

      // Проверяем, заблокирован ли пользователь
      if (user.status !== "blocked") {
        throw new BadRequest("Пользователь не заблокирован", []); // Добавил new
      }

      // Деактивируем все активные санкции
      await UserSanctionModel.updateMany(
        { user: userId, isActive: true },
        { isActive: false },
        { session },
      );

      // Обновляем статус пользователя
      user.status = "active";
      user.blockedUntil = null;
      user.lastSanction = null;
      await user.save({ session });

      // ✅ ОЧИЩАЕМ BLACKLIST: Удаляем все токены пользователя из черного списка
      try {
        // Получаем все сессии пользователя (включая отозванные)
        const userSessions = await UserSessionModel.find({
          // Используем импортированную модель
          userId,
        }).session(session);

        if (userSessions && userSessions.length > 0) {
          const refreshTokens = userSessions.map((s) => s.refreshToken);

          // Удаляем из Redis blacklist
          await bulkRemoveFromBlacklist(refreshTokens);

          info(
            `Токены пользователя ${userId} удалены из blacklist при разблокировке`,
            {
              userId,
              adminId: admin.id,
              tokensCount: refreshTokens.length,
            },
          );
        }
      } catch (blacklistError) {
        _error(
          `Ошибка при очистке blacklist для пользователя ${userId}:`,
          blacklistError,
        );
        // НЕ прерываем транзакцию
      }

      await session.commitTransaction();

      info(`Пользователь ${userId} успешно разблокирован`, {
        userId,
        adminId: admin.id,
      });

      return user;
    } catch (error) {
      await session.abortTransaction();

      if (error instanceof ApiError) {
        throw error;
      }

      _error(`Ошибка при разблокировке пользователя ${userId}:`, error);
      throw new DatabaseError(
        // Добавил new
        `Ошибка при разблокировке пользователя: ${error.message}`,
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Получение истории санкций пользователя
   * @param {string} userId - ID пользователя
   * @returns {Promise<Array>} История санкций
   */
  async getUserSanctions(userId) {
    try {
      const sanctions = await UserSanctionModel.find({ user: userId })
        .populate("admin", "name email")
        .sort({ createdAt: -1 })
        .lean();

      return sanctions;
    } catch (error) {
      _error(
        `Ошибка при получении истории санкций пользователя ${userId}:`,
        error,
      );
      throw new DatabaseError(
        // Добавил new
        `Ошибка при получении истории санкций: ${error.message}`,
      );
    }
  }

  /**
   * Получение активных санкций
   * @param {string} userId - ID пользователя
   * @returns {Promise<Array>} Активные санкции
   */
  async getActiveSanctions(userId) {
    try {
      const sanctions = await UserSanctionModel.find({
        user: userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
        .populate("admin", "name email")
        .sort({ expiresAt: 1 })
        .lean();

      return sanctions;
    } catch (error) {
      _error(
        `Ошибка при получении активных санкций пользователя ${userId}:`,
        error,
      );
      throw new DatabaseError(
        // Добавил new
        `Ошибка при получении активных санкций: ${error.message}`,
      );
    }
  }

  /**
   * Проверка, заблокирован ли пользователь
   * @param {string} userId - ID пользователя
   * @returns {Promise<Object>} Статус блокировки
   */
  async checkUserBlockStatus(userId) {
    try {
      const user = await UserModel.findById(userId)
        .select("status blockedUntil name email")
        .lean();

      if (!user) {
        throw new NotFoundError("Пользователь не найден"); // Добавил new
      }

      // Проверяем, не истекла ли блокировка
      if (user.blockedUntil && user.blockedUntil < new Date()) {
        // Автоматическая разблокировка
        await this.unblockUser(userId, { id: "system", name: "System" });
        user.status = "active";
        user.blockedUntil = null;
      }

      const activeSanctions = await this.getActiveSanctions(userId);

      return {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          status: user.status,
          blockedUntil: user.blockedUntil,
        },
        hasActiveSanctions: activeSanctions.length > 0,
        activeSanctions,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      _error(
        `Ошибка при проверке статуса блокировки пользователя ${userId}:`,
        error,
      );
      throw new DatabaseError(
        // Добавил new
        `Ошибка при проверке статуса блокировки: ${error.message}`,
      );
    }
  }

  /**
   * Автоматическая разблокировка по истечению срока (запускается по крону)
   */
  async autoUnblockExpiredSanctions() {
    try {
      const now = new Date();

      // Находим все активные санкции с истекшим сроком
      const expiredSanctions = await UserSanctionModel.find({
        isActive: true,
        expiresAt: { $lt: now },
        duration: { $gt: 0 }, // Только временные блокировки (не бессрочные)
      }).populate("user", "_id status");

      let unblockedCount = 0;

      for (const sanction of expiredSanctions) {
        try {
          await this.unblockUser(sanction.user._id, {
            id: "system_auto",
            name: "Система (авто)",
          });
          unblockedCount++;

          info(
            `Пользователь ${sanction.user._id} автоматически разблокирован`,
            {
              userId: sanction.user._id,
              sanctionId: sanction._id,
              expiresAt: sanction.expiresAt,
            },
          );
        } catch (error) {
          _error(
            `Ошибка при автоматической разблокировке пользователя ${sanction.user._id}:`,
            error,
          );
        }
      }

      info(
        `Автоматическая разблокировка завершена. Разблокировано пользователей: ${unblockedCount} из ${expiredSanctions.length}`,
      );
      return { total: expiredSanctions.length, unblocked: unblockedCount };
    } catch (error) {
      _error("Ошибка в autoUnblockExpiredSanctions:", error);
      throw error;
    }
  }
}

export default new UserSanctionService();
