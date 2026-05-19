// services/user.service.ts
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { UserModel } from "../models/index.models.js";
import type { AuthUser } from "../types/auth.js";
import type { IUser, UserRole, UserStatus } from "../types/user.types.js";

// Types for search parameters
export interface SearchUsersParams {
  query?: string;
  status?: UserStatus;
  role?: UserRole;
  page?: number;
  limit?: number;
}

// Types for search result
export interface UserWithBlockInfo {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  blockedUntil?: Date | null;
  blockInfo?: {
    blockedUntil: Date;
    timeLeft: string;
    isPermanent: boolean;
  } | null;
}

export interface SearchUsersResult {
  users: UserWithBlockInfo[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

class UserService {
  /**
   * Get all users (without pagination) – admin only
   */
  async getAllUsers(currentUser: AuthUser): Promise<IUser[]> {
    try {
      // Optional: filter out current user if needed
      const users = await UserModel.find()
        .sort({ createdAt: -1 })
        .lean<IUser[]>();

      return users;
    } catch (error) {
      throw ApiError.DatabaseError(
        `Error fetching users: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Universal user role update
   */
  async updateUserRole(
    userId: string,
    newRole: UserRole,
    currentUser: AuthUser,
  ): Promise<IUser> {
    try {
      // Validate new role
      const allowedRoles: UserRole[] = ["user", "admin"];
      if (!allowedRoles.includes(newRole)) {
        throw ApiError.BadRequest(
          `Invalid role. Allowed: ${allowedRoles.join(", ")}`,
        );
      }

      // Prevent self‑role change
      if (userId.toString() === currentUser.id.toString()) {
        throw ApiError.BadRequest("You cannot change your own role");
      }

      // Find user
      const user = await UserModel.findById(userId);
      if (!user) {
        throw ApiError.NotFoundError("User not found");
      }

      const oldRole = user.role;
      user.role = newRole;
      await user.save();

      const updatedUser = await UserModel.findById(userId).lean<IUser>();
      if (!updatedUser) {
        throw ApiError.NotFoundError("User not found after update");
      }

      logger.info(
        `User ${currentUser._id} changed role of user ${userId} from ${oldRole} to ${newRole}`,
      );

      return updatedUser;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError(
        `Error updating user role: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Convenience wrapper: promote user to admin
   */
  async promoteToAdmin(userId: string, currentUser: AuthUser): Promise<IUser> {
    return this.updateUserRole(userId, "admin", currentUser);
  }

  /**
   * Convenience wrapper: demote user to regular user
   */
  async demoteToUser(userId: string, currentUser: AuthUser): Promise<IUser> {
    return this.updateUserRole(userId, "user", currentUser);
  }

  /**
   * Get user by ID (for internal use)
   */
  async getUserById(userId: string): Promise<IUser> {
    try {
      const user = await UserModel.findById(userId)
        .select(
          "-password -tokens.resetToken -tokens.resetTokenStatus -tokens.resetTokenExpiration -passwordChangeHistory -__v",
        )
        .lean<IUser>();

      if (!user) {
        throw ApiError.NotFoundError("User not found");
      }

      return user;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError(
        `Error fetching user: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Search users with filters and pagination
   */
  async searchUsers(params: SearchUsersParams): Promise<SearchUsersResult> {
    try {
      const { query, status, role, page = 1, limit = 50 } = params;
      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};

      if (query?.trim()) {
        const searchQuery = query.trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchQuery);
        const isObjectId = Types.ObjectId.isValid(searchQuery);

        if (isEmail) {
          filter.email = { $regex: searchQuery, $options: "i" };
        } else if (isObjectId) {
          filter._id = new Types.ObjectId(searchQuery);
        } else {
          filter.$or = [
            { name: { $regex: searchQuery, $options: "i" } },
            { email: { $regex: searchQuery, $options: "i" } },
          ];
        }
      }

      if (
        status &&
        [
          "active",
          "blocked",
          "deactivation_pending",
          "deactivated",
          "anonymized",
        ].includes(status)
      ) {
        filter.status = status;
      }

      if (role && ["user", "admin", "superadmin", "bot"].includes(role)) {
        filter.role = role;
      }

      // Execute queries
      const [users, total] = await Promise.all([
        UserModel.find(filter)
          .select(
            "-password -tokens.resetToken -tokens.resetTokenStatus -tokens.resetTokenExpiration -passwordChangeHistory -__v",
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean<IUser[]>(),
        UserModel.countDocuments(filter),
      ]);

      // Enhance users with block info
      const usersWithBlockInfo: UserWithBlockInfo[] = users.map((user) => {
        const isBlocked = user.status === "blocked";
        let blockInfo = null;

        if (isBlocked && user.blockedUntil) {
          const now = new Date();
          const blockedUntil = new Date(user.blockedUntil);
          const timeLeft = blockedUntil.getTime() - now.getTime();

          if (timeLeft > 0) {
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutesLeft = Math.floor(
              (timeLeft % (1000 * 60 * 60)) / (1000 * 60),
            );
            blockInfo = {
              blockedUntil: user.blockedUntil,
              timeLeft: `${hoursLeft}ч ${minutesLeft}м`,
              isPermanent: hoursLeft > 87600, // ~10 years
            };
          }
        }

        return {
          ...user,
          blockInfo,
        } as UserWithBlockInfo;
      });

      return {
        users: usersWithBlockInfo,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw ApiError.DatabaseError(
        `Error searching users: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get user with full details (including last sanction)
   */
  async getUserWithDetails(userId: string): Promise<IUser> {
    try {
      const user = await UserModel.findById(userId)
        .select(
          "-password -tokens.resetToken -tokens.resetTokenStatus -tokens.resetTokenExpiration -passwordChangeHistory -__v",
        )
        .populate({
          path: "lastSanction",
          select: "reason duration expiresAt createdAt",
          populate: {
            path: "admin",
            select: "name email",
          },
        })
        .lean<IUser>();

      if (!user) {
        throw ApiError.NotFoundError("User not found");
      }

      return user;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError(
        `Error fetching user details: ${(error as Error).message}`,
      );
    }
  }
}

export default new UserService();
