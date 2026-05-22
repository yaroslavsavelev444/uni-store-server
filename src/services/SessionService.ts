// services/sessionService.ts

import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { UserSessionModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type {
  RedisOperation,
  SessionFilter,
  SessionInvalidationResult,
  SessionStats,
  SessionWithRevokedStatus,
  UpdateSessionData,
} from "../types/session.js";
import type {
  IUserSession,
  RevokedReason,
} from "../types/userSession.types.js";

class SessionService {
  async checkRedisHealth(): Promise<boolean> {
    return await this.safeRedisOperation(async () => {
      await redisClient.ping();
      return true;
    }, 2);
  }

  async safeRedisOperation<T = any>(
    operation: RedisOperation<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        logger.warn({
          msg: "Redis operation failed",
          error: lastError.message,
          attempt,
          maxRetries,
        });

        if (attempt < maxRetries) {
          const delay = Math.min(100 * 2 ** (attempt - 1), 2000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error({
      msg: "Redis operation failed after all retries",
      error: lastError?.message,
      maxRetries,
    });
    throw lastError;
  }

  /**
   * Инвалидирует все сессии пользователя кроме указанной (текущей)
   * АТОМАРНАЯ операция: обновляет MongoDB И добавляет в Redis blacklist
   */
  async invalidateAllSessionsExceptCurrent(
    userId: string,
    currentSessionId: string | null = null,
  ): Promise<SessionInvalidationResult> {
    const session = await UserSessionModel.db.startSession();

    try {
      session.startTransaction();

      const filter: SessionFilter = {
        userId: new Types.ObjectId(userId),
        revoked: false,
      };

      if (currentSessionId) {
        filter._id = { $ne: new Types.ObjectId(currentSessionId) };
      }

      const sessionsToInvalidate =
        await UserSessionModel.find(filter).session(session);

      if (sessionsToInvalidate.length === 0) {
        await session.commitTransaction();
        return { invalidatedCount: 0, keptCurrent: !!currentSessionId };
      }

      const updateData: UpdateSessionData = {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: currentSessionId
          ? "password_changed_other_sessions"
          : "password_changed_all_sessions",
      };

      const updateResult = await UserSessionModel.updateMany(
        filter,
        { $set: updateData },
        { session },
      );

      await this.bulkAddToBlacklist(sessionsToInvalidate);

      await session.commitTransaction();

      logger.info({
        msg: "Sessions invalidated",
        userId,
        invalidatedCount: updateResult.modifiedCount,
        keptCurrent: !!currentSessionId,
      });

      return {
        invalidatedCount: updateResult.modifiedCount,
        keptCurrent: !!currentSessionId,
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error({
        msg: "Error invalidating sessions",
        userId,
        error: (error as Error).message,
      });
      throw ApiError.InternalServerError("Ошибка при обновлении сессий");
    } finally {
      session.endSession();
    }
  }

  /**
   * ТОЛЬКО добавляет сессии в Redis blacklist (без изменения MongoDB)
   * Используется когда сессии уже инвалидированы в БД
   */
  async addSessionsToBlacklist(
    userId: string,
    currentSessionId: string | null = null,
  ): Promise<void> {
    try {
      const sessions = await UserSessionModel.find({
        userId: new Types.ObjectId(userId),
      });

      const sessionsToBlacklist = sessions.filter(
        (session) =>
          !currentSessionId || session._id.toString() !== currentSessionId,
      );

      if (sessionsToBlacklist.length === 0) {
        logger.debug({
          msg: "No sessions to blacklist",
          userId,
        });
        return;
      }

      await this.bulkAddToBlacklist(sessionsToBlacklist);

      logger.info({
        msg: "Sessions added to Redis blacklist",
        userId,
        sessionsCount: sessionsToBlacklist.length,
      });
    } catch (error) {
      logger.error({
        msg: "Error adding sessions to Redis blacklist",
        userId,
        error: (error as Error).message,
      });
      throw ApiError.InternalServerError("Ошибка при обновлении сессий");
    }
  }

  /**
   * Массовое добавление сессий в Redis blacklist
   */
  async bulkAddToBlacklist(sessions: IUserSession[]): Promise<any> {
    if (!sessions.length) return;

    return await this.safeRedisOperation(async () => {
      const operations: [string, ...any[]][] = sessions.map((session) => {
        const blacklistKey = `blacklist:refresh:${session.refreshToken}`;
        const ttl = 30 * 24 * 60 * 60;
        return ["setex", blacklistKey, ttl, "revoked"] as [string, ...any[]];
      });

      const results = await redisClient.pipeline(operations);

      const successCount = results.filter(
        ([err]: [Error | null, any]) => err === null,
      ).length;

      logger.debug({
        msg: "Bulk blacklist addition completed",
        sessionsCount: sessions.length,
        successCount,
      });

      return results;
    }, 3);
  }

  /**
   * Проверяет, отозвана ли сессия (через Redis blacklist)
   */
  async isSessionRevoked(refreshToken: string): Promise<boolean> {
    // return await this.safeRedisOperation(async () => {
    //   const blacklistKey = `blacklist:refresh:${refreshToken}`;
    //   const isRevoked = await redisClient.exists(blacklistKey);
    //   if (isRevoked) {
    //     const ttl = await redisClient.ttl(blacklistKey);
    //     logger.debug({
    //       msg: "Session revoked check",
    //       isRevoked,
    //       ttl,
    //       blacklistKey,
    //     });
    //   }
    //   return isRevoked === 1;
    // }, 2);
    return false;
  }

  /**
   * Получает все активные сессии пользователя
   */
  async getUserActiveSessions(userId: string): Promise<IUserSession[]> {
    try {
      const sessions = await UserSessionModel.find({
        userId: new Types.ObjectId(userId),
        revoked: false,
      }).sort({ lastUsedAt: -1 });

      return sessions;
    } catch (error) {
      logger.error({
        msg: "Error getting user active sessions",
        userId,
        error: (error as Error).message,
      });
      throw ApiError.InternalServerError("Ошибка при получении сессий");
    }
  }

  /**
   * Инвалидирует конкретную сессию по ID
   */
  async invalidateSpecificSession(
    sessionId: string,
    reason: RevokedReason = "manually_revoked",
  ): Promise<{ success: boolean }> {
    const session = await UserSessionModel.db.startSession();

    try {
      session.startTransaction();

      const sessionToInvalidate = await UserSessionModel.findById(
        new Types.ObjectId(sessionId),
      ).session(session);

      if (!sessionToInvalidate) {
        throw ApiError.NotFoundError("Сессия не найдена");
      }

      await UserSessionModel.updateOne(
        { _id: new Types.ObjectId(sessionId) },
        {
          $set: {
            revoked: true,
            revokedAt: new Date(),
            revokedReason: reason,
          },
        },
        { session },
      );

      await this.safeRedisOperation(async () => {
        const blacklistKey = `blacklist:refresh:${sessionToInvalidate.refreshToken}`;
        const ttl = 30 * 24 * 60 * 60;
        await redisClient.setex(blacklistKey, ttl, "revoked");
      }, 2);

      await session.commitTransaction();

      logger.info({
        msg: "Specific session invalidated",
        sessionId,
        reason,
      });

      return { success: true };
    } catch (error) {
      await session.abortTransaction();
      logger.error({
        msg: "Error invalidating specific session",
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Очищает старые отозванные сессии (cleanup task)
   */
  async cleanupRevokedSessions(daysOld: number = 30): Promise<any> {
    const session = await UserSessionModel.db.startSession();

    try {
      session.startTransaction();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const sessionsToDelete = await UserSessionModel.find({
        revoked: true,
        revokedAt: { $lt: cutoffDate },
      }).session(session);

      const refreshTokens = sessionsToDelete.map((s) => s.refreshToken);

      const deleteResult = await UserSessionModel.deleteMany({
        revoked: true,
        revokedAt: { $lt: cutoffDate },
      }).session(session);

      if (refreshTokens.length > 0) {
        await this.bulkRemoveFromBlacklist(refreshTokens);
      }

      await session.commitTransaction();

      logger.info({
        msg: "Revoked sessions cleaned up",
        sessionsCount: sessionsToDelete.length,
        redisCleaned: refreshTokens.length,
      });

      return deleteResult;
    } catch (error) {
      await session.abortTransaction();
      logger.error({
        msg: "Error cleaning up revoked sessions",
        error: (error as Error).message,
      });
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Массовое удаление из Redis blacklist
   */
  async bulkRemoveFromBlacklist(refreshTokens: string[]): Promise<any> {
    if (!refreshTokens.length) return;

    return await this.safeRedisOperation(async () => {
      const operations: [string, ...any[]][] = refreshTokens.map((token) => {
        const blacklistKey = `blacklist:refresh:${token}`;
        return ["del", blacklistKey] as [string, ...any[]];
      });

      const results = await redisClient.pipeline(operations);

      logger.debug({
        msg: "Bulk blacklist removal completed",
        refreshTokensCount: refreshTokens.length,
        successCount: results.filter(
          ([err]: [Error | null, any]) => err === null,
        ).length,
      });

      return results;
    }, 3);
  }

  /**
   * Добавляет токен во временный blacklist
   */
  async addToTempBlacklist(
    token: string,
    ttlSeconds: number = 60,
  ): Promise<void> {
    return await this.safeRedisOperation(async () => {
      const tempBlacklistKey = `temp_blacklist:refresh:${token}`;
      await redisClient.setex(tempBlacklistKey, ttlSeconds, "temp_revoked");

      logger.debug({
        msg: "Temp blacklist addition completed",
        token: token.substring(0, 10) + "...",
      });
    }, 2);
  }

  /**
   * Проверяет временный blacklist
   */
  async isInTempBlacklist(token: string): Promise<boolean> {
    return await this.safeRedisOperation(async () => {
      const tempBlacklistKey = `temp_blacklist:refresh:${token}`;
      const exists = await redisClient.exists(tempBlacklistKey);

      logger.debug({
        msg: "Temp blacklist check",
        token: token.substring(0, 10) + "...",
        exists,
      });

      return exists === 1;
    }, 2);
  }

  /**
   * Получает статистику по сессиям и blacklist
   */
  async getSessionStats(): Promise<SessionStats> {
    try {
      const totalSessions = await UserSessionModel.countDocuments();
      const activeSessions = await UserSessionModel.countDocuments({
        revoked: false,
      });
      const revokedSessions = await UserSessionModel.countDocuments({
        revoked: true,
      });

      const blacklistCount = await this.safeRedisOperation(async () => {
        const keys = await redisClient.keys("blacklist:refresh:*");
        return keys.length;
      }, 2);

      const tempBlacklistCount = await this.safeRedisOperation(async () => {
        const keys = await redisClient.keys("temp_blacklist:refresh:*");
        return keys.length;
      }, 2);

      return {
        totalSessions,
        activeSessions,
        revokedSessions,
        blacklistCount,
        tempBlacklistCount,
        redisHealth: await this.checkRedisHealth(),
      };
    } catch (error) {
      logger.error({
        msg: "Error getting session stats",
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Получает информацию о сессии по refresh token
   */
  /**
   * Получает информацию о сессии по refresh token
   */
  async getSessionByRefreshToken(
    refreshToken: string,
  ): Promise<SessionWithRevokedStatus | null> {
    return await this.safeRedisOperation(async () => {
      const session = await UserSessionModel.findOne({ refreshToken });
      if (!session) {
        return null;
      }

      const isRevoked = await this.isSessionRevoked(refreshToken);

      // ✅ Создаем объект с нужными полями, но без методов Mongoose
      const sessionObj = session.toObject();
      return {
        ...sessionObj,
        isRevoked,
      } as unknown as SessionWithRevokedStatus;
    }, 2);
  }
  /**
   * Обновляет время последнего использования сессии
   */
  async updateSessionLastUsed(sessionId: string): Promise<any> {
    return await this.safeRedisOperation(async () => {
      const result = await UserSessionModel.updateOne(
        { _id: new Types.ObjectId(sessionId) },
        { $set: { lastUsedAt: new Date() } },
      );

      logger.debug({
        msg: "Session last used updated",
        sessionId,
        result,
      });

      return result;
    }, 2);
  }

  /**
   * Получает количество активных сессий пользователя
   */
  async getActiveSessionsCount(userId: string): Promise<number> {
    return await this.safeRedisOperation(async () => {
      const count = await UserSessionModel.countDocuments({
        userId: new Types.ObjectId(userId),
        revoked: false,
      });

      logger.debug({
        msg: "Active sessions count",
        userId,
        count,
      });

      return count;
    }, 2);
  }

  /**
   * Удаляет все сессии пользователя (полная очистка)
   */
  async deleteAllUserSessions(userId: string): Promise<any> {
    const session = await UserSessionModel.db.startSession();

    try {
      session.startTransaction();

      const userSessions = await UserSessionModel.find({
        userId: new Types.ObjectId(userId),
      }).session(session);

      const refreshTokens = userSessions.map((s) => s.refreshToken);

      const deleteResult = await UserSessionModel.deleteMany({
        userId: new Types.ObjectId(userId),
      }).session(session);

      if (refreshTokens.length > 0) {
        await this.bulkRemoveFromBlacklist(refreshTokens);
      }

      await session.commitTransaction();

      logger.info({
        msg: "All user sessions deleted",
        userId,
        deleteResult,
      });

      return deleteResult;
    } catch (error) {
      await session.abortTransaction();
      logger.error({
        msg: "Error deleting all user sessions",
        userId,
        error: (error as Error).message,
      });
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export default new SessionService();
