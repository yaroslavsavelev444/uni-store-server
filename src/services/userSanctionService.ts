import type { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import {
  UserModel,
  UserSanctionModel,
  UserSessionModel,
} from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type {
  BlockOptions,
  UserSanctionDocument,
} from "../types/user-sanction.types.js";
import SessionService from "./SessionService.js";

// Minimal interface for admin user (adjust as needed)
interface AdminUser {
  id: string | Types.ObjectId;
  name?: string;
  email?: string;
  role: "admin" | "superadmin" | string;
}

class UserSanctionService {
  /**
   * Block a user
   * @param userId - ID of the user to block
   * @param admin - Admin object performing the block
   * @param options - Block options
   * @returns Created sanction with populated references
   */
  async blockUser(
    userId: string | Types.ObjectId,
    admin: AdminUser,
    options: BlockOptions = {},
  ): Promise<UserSanctionDocument> {
    const session = await UserModel.db.startSession();

    try {
      session.startTransaction();

      const {
        duration = 24,
        reason = "Нарушение правил сообщества",
        type = "block",
        metadata = {},
      } = options;

      // Check if user exists
      const user = await UserModel.findById(userId).session(session);
      if (!user) {
        throw ApiError.NotFoundError("Пользователь не найден");
      }

      // Prevent self‑block
      if (userId.toString() === admin.id.toString()) {
        throw ApiError.BadRequest("Вы не можете заблокировать себя");
      }

      // Check role permissions
      if (user.role === "admin") {
        if (admin.role !== "superadmin") {
          throw ApiError.ForbiddenError(
            "Только суперадмин может блокировать администраторов",
          );
        }
      }

      // Deactivate all previous active sanctions
      await UserSanctionModel.updateMany(
        { user: userId, isActive: true },
        { isActive: false },
        { session },
      );

      // Calculate expiresAt
      let expiresAt: Date;
      if (duration === 0) {
        expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years
      } else {
        expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
      }

      // Create new sanction
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

      // Update user status
      user.status = "blocked";
      user.blockedUntil = sanction.expiresAt ?? null;
      user.lastSanction = sanction._id;
      await user.save({ session });

      // Invalidate all user sessions
      try {
        await SessionService.deleteAllUserSessions(userId.toString());
        logger.info({ msg: "All user sessions invalidated" });
      } catch (sessionError) {
        logger.error({
          msg: `Ошибка при инвалидации всех сессий пользователя ${userId}:`,
          error: sessionError,
        });
        // Do not abort transaction
      }

      // Add all active refresh tokens to Redis blacklist
      try {
        const activeSessions = await SessionService.getUserActiveSessions(
          userId.toString(),
        );
        if (activeSessions && activeSessions.length > 0) {
          const refreshTokens = activeSessions.map((s: any) => s.refreshToken);

          const operations: [string, ...any[]][] = refreshTokens.map(
            (token: string) => {
              const blacklistKey = `blacklist:refresh:${token}`;
              const ttl =
                duration === 0 ? 365 * 24 * 60 * 60 : duration * 60 * 60;
              return ["setex", blacklistKey, ttl, "user_blocked"];
            },
          );

          await redisClient.pipeline(operations);

          logger.info({
            msg: "Added tokens to blacklist",
            tokensCount: refreshTokens.length,
          });
        }
      } catch (blacklistError) {
        logger.error({
          msg: `Ошибка при добавлении токенов в Redis blacklist:`,
          error: blacklistError,
        });
        // Do not abort transaction
      }

      await session.commitTransaction();

      // Populate references outside transaction
      const populatedSanction = await UserSanctionModel.findById(sanction._id)
        .populate("user", "name email role status")
        .populate("admin", "name email role")
        .exec();

      if (!populatedSanction) {
        throw ApiError.DatabaseError("Не удалось получить созданную санкцию");
      }

      logger.info({
        msg: "User blocked",
        userId,
        adminId: admin.id,
        sanctionId: sanction._id,
      });

      return populatedSanction as unknown as UserSanctionDocument;
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof ApiError) throw error;
      logger.error({
        msg: "Error blocking user",
        error: error as Error,
      });
      throw ApiError.DatabaseError(
        `Ошибка при блокировке пользователя: ${(error as Error).message}`,
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Unblock a user
   * @param userId - ID of the user to unblock
   * @param admin - Admin object performing the unblock
   * @returns Updated user document
   */
  async unblockUser(
    userId: string | Types.ObjectId,
    admin: AdminUser,
  ): Promise<any> {
    const session = await UserModel.db.startSession();

    try {
      session.startTransaction();

      const user = await UserModel.findById(userId).session(session);
      if (!user) {
        throw ApiError.NotFoundError("Пользователь не найден");
      }

      if (user.status !== "blocked") {
        throw ApiError.BadRequest("Пользователь не заблокирован");
      }

      // Deactivate all active sanctions
      await UserSanctionModel.updateMany(
        { user: userId, isActive: true },
        { isActive: false },
        { session },
      );

      // Reset user status
      user.status = "active";
      user.blockedUntil = null;
      user.lastSanction = null;
      await user.save({ session });

      // Clear blacklist for this user's tokens
      try {
        const userSessions = await UserSessionModel.find({ userId }).session(
          session,
        );
        if (userSessions && userSessions.length > 0) {
          const refreshTokens = userSessions.map((s) => s.refreshToken);
          await SessionService.bulkRemoveFromBlacklist(refreshTokens);
          logger.info({
            msg: "Removed tokens from blacklist",
            tokensCount: refreshTokens.length,
          });
        }
      } catch (blacklistError) {
        logger.error({
          msg: "Error removing tokens from blacklist",
          error: blacklistError,
        });
        // Do not abort transaction
      }

      await session.commitTransaction();

      logger.info({
        msg: "User unblocked",
        userId,
        adminId: admin.id,
      });

      return user;
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof ApiError) throw error;
      logger.error({
        msg: "Error unblocking user",
        error: error as Error,
      });
      throw ApiError.DatabaseError(
        `Ошибка при разблокировке пользователя: ${(error as Error).message}`,
      );
    } finally {
      session.endSession();
    }
  }

  /**
   * Get sanction history of a user
   * @param userId - User ID
   * @returns Array of sanctions
   */
  async getUserSanctions(userId: string | Types.ObjectId): Promise<any[]> {
    try {
      const sanctions = await UserSanctionModel.find({ user: userId })
        .populate("admin", "name email")
        .sort({ createdAt: -1 })
        .lean();
      return sanctions;
    } catch (error) {
      logger.error({
        msg: `Ошибка при получении истории санкций пользователя ${userId}:`,
        error,
      });
      throw ApiError.DatabaseError(
        `Ошибка при получении истории санкций: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get active sanctions for a user
   * @param userId - User ID
   * @returns Array of active sanctions
   */
  async getActiveSanctions(userId: string | Types.ObjectId): Promise<any[]> {
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
      logger.error({
        msg: `Ошибка при получении активных санкций пользователя ${userId}:`,
        error,
      });
      throw ApiError.DatabaseError(
        `Ошибка при получении активных санкций: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if a user is blocked
   * @param userId - User ID
   * @returns Block status and details
   */
  async checkUserBlockStatus(userId: string | Types.ObjectId): Promise<any> {
    try {
      const user = await UserModel.findById(userId)
        .select("status blockedUntil name email")
        .lean();

      if (!user) {
        throw ApiError.NotFoundError("Пользователь не найден");
      }

      // Auto‑unblock if expired
      if (user.blockedUntil && user.blockedUntil < new Date()) {
        await this.unblockUser(userId, {
          id: "system",
          name: "System",
          role: "system",
        });
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
      if (error instanceof ApiError) throw error;
      logger.error({
        msg: `Ошибка при проверке статуса блокировки пользователя ${userId}:`,
        error,
      });
      throw ApiError.DatabaseError(
        `Ошибка при проверке статуса блокировки: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Automatically unblock expired sanctions (scheduled job)
   * @returns Summary of processed sanctions
   */
  async autoUnblockExpiredSanctions(): Promise<{
    total: number;
    unblocked: number;
  }> {
    try {
      const now = new Date();
      const expiredSanctions = await UserSanctionModel.find({
        isActive: true,
        expiresAt: { $lt: now },
        duration: { $gt: 0 }, // only temporary blocks
      }).populate("user", "_id status");

      let unblockedCount = 0;

      for (const sanction of expiredSanctions) {
        try {
          await this.unblockUser(sanction.user._id, {
            id: "system_auto",
            name: "Система (авто)",
            role: "system",
          });
          unblockedCount++;
          logger.info({
            msg: "Автоматическая разблокировка пользователя",
            userId: sanction.user._id,
          });
        } catch (error) {
          logger.error({
            msg: "Ошибка при автоматической разблокировке пользователя",
            userId: sanction.user._id,
            error: error as Error,
          });
        }
      }

      logger.info(
        `Автоматическая разблокировка завершена. Разблокировано пользователей: ${unblockedCount} из ${expiredSanctions.length}`,
      );
      return { total: expiredSanctions.length, unblocked: unblockedCount };
    } catch (error) {
      logger.error({
        msg: "Ошибка при автоматической разблокировке пользователей",
        error: error as Error,
      });
      throw error;
    }
  }
}

export default new UserSanctionService();
