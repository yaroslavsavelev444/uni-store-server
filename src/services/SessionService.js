// services/sessionService.js
const redisClient = require("../redis/redis.client");
const logger = require("../logger/logger");
const ApiError = require("../exceptions/api-error");
const { UserSessionModel } = require("../models/index.models");

class SessionService {
  async checkRedisHealth() {
    return await this.safeRedisOperation(async () => {
      await redisClient.ping();
      return true;
    }, 2);
  }

  async safeRedisOperation(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        logger.warn(`Redis operation attempt ${attempt}/${maxRetries} failed`, {
          error: error.message,
          operation: operation.name || 'anonymous',
          attempt
        });
        
        if (attempt < maxRetries) {
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    logger.error(`All Redis operation attempts failed`, {
      error: lastError.message,
      operation: lastError.operation || 'unknown'
    });
    throw lastError;
  }

  /**
   * Инвалидирует все сессии пользователя кроме указанной (текущей)
   * АТОМАРНАЯ операция: обновляет MongoDB И добавляет в Redis blacklist
   */
  async invalidateAllSessionsExceptCurrent(userId, currentSessionId = null) {
      const session = await UserSessionModel.db.startSession();
    
    try {
      session.startTransaction();

      // 1. Находим сессии ДО обновления (чтобы избежать race condition)
      const filter = {
        userId,
        revoked: false,
      };

      if (currentSessionId) {
        filter._id = { $ne: currentSessionId };
      }

      const sessionsToInvalidate = await UserSessionModel.find(filter).session(session);

      if (sessionsToInvalidate.length === 0) {
        await session.commitTransaction();
        return { invalidatedCount: 0, keptCurrent: !!currentSessionId };
      }

      // 2. Атомарно обновляем сессии в MongoDB
      const updateResult = await UserSessionModel.updateMany(
        filter,
        {
          $set: {
            revoked: true,
            revokedAt: new Date(),
            revokedReason: currentSessionId
              ? "password_changed_other_sessions"
              : "password_changed_all_sessions",
          },
        },
        { session }
      );

      // 3. Добавляем refreshToken'ы в Redis blacklist
      await this.bulkAddToBlacklist(sessionsToInvalidate);

      await session.commitTransaction();

      logger.info("User sessions invalidated after password change", {
        userId,
        currentSessionId,
        invalidatedCount: updateResult.modifiedCount,
        keptCurrent: !!currentSessionId,
      });

      return {
        invalidatedCount: updateResult.modifiedCount,
        keptCurrent: !!currentSessionId,
      };

    } catch (error) {
      await session.abortTransaction();
      logger.error("Error invalidating user sessions", {
        userId,
        error: error.message,
        stack: error.stack,
      });
      throw ApiError.InternalError("Ошибка при обновлении сессий");
    } finally {
      session.endSession();
    }
  }

  /**
   * ТОЛЬКО добавляет сессии в Redis blacklist (без изменения MongoDB)
   * Используется когда сессии уже инвалидированы в БД
   */
  async addSessionsToBlacklist(userId, currentSessionId = null) {
    try {
      // Находим ВСЕ сессии пользователя (включая уже отозванные)
      const sessions = await UserSessionModel.find({ userId });

      const sessionsToBlacklist = sessions.filter(session => 
        !currentSessionId || session._id.toString() !== currentSessionId
      );

      if (sessionsToBlacklist.length === 0) {
        logger.debug("No sessions to blacklist", { userId });
        return;
      }

      await this.bulkAddToBlacklist(sessionsToBlacklist);

      logger.info("Sessions added to Redis blacklist", {
        userId,
        totalSessions: sessions.length,
        blacklistedCount: sessionsToBlacklist.length,
      });

    } catch (error) {
      logger.error("Error adding sessions to Redis blacklist", {
        userId,
        error: error.message,
      });
    }
  }

  /**
   * Массовое добавление сессий в Redis blacklist
   */
  async bulkAddToBlacklist(sessions) {
    if (!sessions.length) return;

    return await this.safeRedisOperation(async () => {
      const operations = sessions.map(session => {
        const blacklistKey = `blacklist:refresh:${session.refreshToken}`;
        const ttl = 30 * 24 * 60 * 60; // 30 дней
        return ['setex', blacklistKey, ttl, "revoked"];
      });

      const results = await redisClient.pipeline(operations);

      const successCount = results.filter(([err]) => err === null).length;
      
      logger.debug("Bulk blacklist addition completed", {
        sessionsCount: sessions.length,
        successCount
      });

      return results;
    }, 3); // Больше попыток для массовых операций
  }

  /**
   * Проверяет, отозвана ли сессия (через Redis blacklist)
   */
  async isSessionRevoked(refreshToken) {
    return await this.safeRedisOperation(async () => {
      const blacklistKey = `blacklist:refresh:${refreshToken}`;
      const isRevoked = await redisClient.exists(blacklistKey);
      
      if (isRevoked) {
        const ttl = await redisClient.ttl(blacklistKey);
        logger.debug("Session revoked check", {
          token: refreshToken.substring(0, 10) + '...',
          ttl
        });
      }
      
      return isRevoked;
    }, 2);
  }

  /**
   * Получает все активные сессии пользователя
   */
  async getUserActiveSessions(userId) {
    try {
      const sessions = await UserSessionModel.find({
        userId,
        revoked: false,
      }).sort({ lastUsedAt: -1 });

      return sessions;
    } catch (error) {
      logger.error("Error getting user active sessions", {
        userId,
        error: error.message,
      });
      throw ApiError.InternalError("Ошибка при получении сессий");
    }
  }

  /**
   * Инвалидирует конкретную сессию по ID
   */
  async invalidateSpecificSession(sessionId, reason = "manually_revoked") {
    const session = await UserSessionModel.db.startSession()	
    
    try {
      session.startTransaction();

      // 1. Находим сессию ДО обновления
      const sessionToInvalidate = await UserSessionModel.findById(sessionId).session(session);
      if (!sessionToInvalidate) {
        throw ApiError.NotFoundError("Сессия не найдена");
      }

      // 2. Атомарно обновляем сессию в MongoDB
      await UserSessionModel.updateOne(
        { _id: sessionId },
        {
          $set: {
            revoked: true,
            revokedAt: new Date(),
            revokedReason: reason,
          },
        },
        { session }
      );

      // 3. Добавляем в Redis blacklist
      await this.safeRedisOperation(async () => {
        const blacklistKey = `blacklist:refresh:${sessionToInvalidate.refreshToken}`;
        const ttl = 30 * 24 * 60 * 60;
        await redisClient.setex(blacklistKey, ttl, "revoked");
      }, 2);

      await session.commitTransaction();

      logger.info("Specific session invalidated", {
        sessionId,
        userId: sessionToInvalidate.userId,
        reason,
      });

      return { success: true };

    } catch (error) {
      await session.abortTransaction();
      logger.error("Error invalidating specific session", {
        sessionId,
        error: error.message,
      });
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Очищает старые отозванные сессии (cleanup task)
   */
  async cleanupRevokedSessions(daysOld = 30) {
    const session = await UserSessionModel.db.startSession();
    
    try {
      session.startTransaction();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Находим сессии для удаления
      const sessionsToDelete = await UserSessionModel.find({
        revoked: true,
        revokedAt: { $lt: cutoffDate }
      }).session(session);

      // Собираем refreshToken'ы для очистки из Redis
      const refreshTokens = sessionsToDelete.map(s => s.refreshToken);
      
      // Удаляем из MongoDB
      const deleteResult = await UserSessionModel.deleteMany({
        revoked: true,
        revokedAt: { $lt: cutoffDate }
      }).session(session);

      // Удаляем из Redis blacklist
      if (refreshTokens.length > 0) {
        await this.bulkRemoveFromBlacklist(refreshTokens);
      }

      await session.commitTransaction();
      
      logger.info("Revoked sessions cleanup completed", {
        deletedCount: deleteResult.deletedCount,
        redisCleaned: refreshTokens.length,
        cutoffDate: cutoffDate.toISOString()
      });

      return deleteResult;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error("Error cleaning up revoked sessions", { error: error.message });
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Массовое удаление из Redis blacklist
   */
  async bulkRemoveFromBlacklist(refreshTokens) {
    if (!refreshTokens.length) return;
    
    return await this.safeRedisOperation(async () => {
      const operations = refreshTokens.map(token => {
        const blacklistKey = `blacklist:refresh:${token}`;
        return ['del', blacklistKey];
      });
      
      const results = await redisClient.pipeline(operations);
      
      logger.debug("Bulk blacklist removal completed", {
        tokensCount: refreshTokens.length,
        successCount: results.filter(([err]) => err === null).length
      });
      
      return results;
    }, 3); // Больше попыток для массовых операций
  }

  /**
   * Добавляет токен во временный blacklist
   */
  async addToTempBlacklist(token, ttlSeconds = 60) {
    return await this.safeRedisOperation(async () => {
      const tempBlacklistKey = `temp_blacklist:refresh:${token}`;
      await redisClient.setex(tempBlacklistKey, ttlSeconds, "temp_revoked");
      
      logger.debug("Token added to temp blacklist", {
        token: token.substring(0, 10) + '...',
        ttlSeconds
      });
    }, 2);
  }

  /**
   * Проверяет временный blacklist
   */
  async isInTempBlacklist(token) {
    return await this.safeRedisOperation(async () => {
      const tempBlacklistKey = `temp_blacklist:refresh:${token}`;
      const exists = await redisClient.exists(tempBlacklistKey);
      
      logger.debug("Temp blacklist check", {
        token: token.substring(0, 10) + '...',
        exists
      });
      
      return exists;
    }, 2);
  }

  /**
   * Получает статистику по сессиям и blacklist
   */
  async getSessionStats() {
    try {
      const totalSessions = await UserSessionModel.countDocuments();
      const activeSessions = await UserSessionModel.countDocuments({ revoked: false });
      const revokedSessions = await UserSessionModel.countDocuments({ revoked: true });
      
      const blacklistCount = await this.safeRedisOperation(async () => {
        const keys = await redisClient.keys('blacklist:refresh:*');
        return keys.length;
      }, 2);
      
      const tempBlacklistCount = await this.safeRedisOperation(async () => {
        const keys = await redisClient.keys('temp_blacklist:refresh:*');
        return keys.length;
      }, 2);
      
      return {
        totalSessions,
        activeSessions,
        revokedSessions,
        blacklistCount,
        tempBlacklistCount,
        redisHealth: await this.checkRedisHealth()
      };
    } catch (error) {
      logger.error("Error getting session stats", { error: error.message });
      throw error;
    }
  }

  /**
   * Получает информацию о сессии по refresh token
   */
  async getSessionByRefreshToken(refreshToken) {
    return await this.safeRedisOperation(async () => {
      const session = await UserSessionModel.findOne({ refreshToken });
      if (!session) {
        return null;
      }

      // Дополнительно проверяем blacklist
      const isRevoked = await this.isSessionRevoked(refreshToken);
      return {
        ...session.toObject(),
        isRevoked
      };
    }, 2);
  }

  /**
   * Обновляет время последнего использования сессии
   */
  async updateSessionLastUsed(sessionId) {
    return await this.safeRedisOperation(async () => {
      const result = await UserSessionModel.updateOne(
        { _id: sessionId },
        { $set: { lastUsedAt: new Date() } }
      );
      
      logger.debug("Session last used updated", {
        sessionId,
        modified: result.modifiedCount
      });
      
      return result;
    }, 2);
  }

  /**
   * Получает количество активных сессий пользователя
   */
  async getActiveSessionsCount(userId) {
    return await this.safeRedisOperation(async () => {
      const count = await UserSessionModel.countDocuments({
        userId,
        revoked: false
      });
      
      logger.debug("Active sessions count", {
        userId,
        count
      });
      
      return count;
    }, 2);
  }

  /**
   * Удаляет все сессии пользователя (полная очистка)
   */
  async deleteAllUserSessions(userId) {
    const session = await UserSessionModel.db.startSession();
    
    try {
      session.startTransaction();

      // Находим все сессии пользователя
      const userSessions = await UserSessionModel.find({ userId }).session(session);
      
      // Собираем refresh tokens для удаления из Redis
      const refreshTokens = userSessions.map(s => s.refreshToken);
      
      // Удаляем из MongoDB
      const deleteResult = await UserSessionModel.deleteMany({ userId }).session(session);
      
      // Удаляем из Redis blacklist
      if (refreshTokens.length > 0) {
        await this.bulkRemoveFromBlacklist(refreshTokens);
      }

      await session.commitTransaction();

      logger.info("All user sessions deleted", {
        userId,
        deletedCount: deleteResult.deletedCount,
        redisCleaned: refreshTokens.length
      });

      return deleteResult;

    } catch (error) {
      await session.abortTransaction();
      logger.error("Error deleting all user sessions", {
        userId,
        error: error.message
      });
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new SessionService();