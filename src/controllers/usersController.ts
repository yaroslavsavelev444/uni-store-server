// controllers/user.controller.ts
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import ApiError from "../exceptions/api-error.js";
import userSanctionService from "../services/userSanctionService.js";
import userService from "../services/userService.js";
import type {
  BlockBody,
  BlockUnblockResponse,
  GetAllUsersResponse,
  GetBlockStatusResponse,
  GetSanctionsResponse,
  GetUserDetailsResponse,
  GetUserResponse,
  PromoteDemoteResponse,
  SearchUsersQuery,
  SearchUsersResponse,
  UpdateRoleBody,
  UpdateRoleResponse,
  UserIdParams,
} from "../types/controllers/user-controller.js";

export class UserController {
  /**
   * Get all users (admin only)
   * GET /api/admin/users
   */
  async getAllUsers(
    req: Request<{}, GetAllUsersResponse>,
    res: Response<GetAllUsersResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const currentUser = req.user!;
      if (!["admin"].includes(currentUser.role)) {
        throw ApiError.ForbiddenError("Access denied");
      }

      const users = await userService.getAllUsers(currentUser);

      res.status(200).json({
        success: true,
        data: users,
        count: users.length,
        message: "Users list retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user role
   * PATCH /api/admin/users/:userId/role
   */
  async updateUserRole(
    req: Request<UserIdParams, UpdateRoleResponse, UpdateRoleBody>,
    res: Response<UpdateRoleResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const currentUser = req.user!;

      if (!role) {
        throw ApiError.BadRequest("Role is required");
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const updatedUser = await userService.updateUserRole(
        userId,
        role,
        currentUser,
      );

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: `User role updated to "${role}"`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Promote user to admin
   * POST /api/admin/users/:userId/promote
   */
  async promoteToAdmin(
    req: Request<UserIdParams, PromoteDemoteResponse>,
    res: Response<PromoteDemoteResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const updatedUser = await userService.promoteToAdmin(userId, currentUser);

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: "User promoted to admin successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Demote user from admin to regular user
   * POST /api/admin/users/:userId/demote
   */
  async demoteToUser(
    req: Request<UserIdParams, PromoteDemoteResponse>,
    res: Response<PromoteDemoteResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const updatedUser = await userService.demoteToUser(userId, currentUser);

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: "User demoted to regular user successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user by ID (admin)
   * GET /api/admin/users/:userId
   */
  async getUserById(
    req: Request<UserIdParams, GetUserResponse>,
    res: Response<GetUserResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const user = await userService.getUserById(userId);

      res.status(200).json({
        success: true,
        data: user,
        message: "User data retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search users
   * GET /api/admin/users/search
   */
  async searchUsers(
    req: Request<{}, SearchUsersResponse, {}, SearchUsersQuery>,
    res: Response<SearchUsersResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { query, status, role, page = 1, limit = 50 } = req.query;

      const searchParams = {
        query,
        status,
        role,
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
      };

      const result = await userService.searchUsers(searchParams);

      res.status(200).json({
        success: true,
        data: result.users,
        pagination: result.pagination,
        message: "Users search completed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Block a user
   * POST /api/admin/users/:userId/block
   */
  async blockUser(
    req: Request<UserIdParams, BlockUnblockResponse, BlockBody>,
    res: Response<BlockUnblockResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const { duration, reason, type = "block" } = req.body;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      if (duration !== 0 && (!duration || duration < 1)) {
        throw ApiError.BadRequest(
          "Duration must be >0 or 0 for permanent block",
        );
      }

      const sanction = await userSanctionService.blockUser(
        userId,
        currentUser,
        {
          duration: duration ? parseInt(duration.toString(), 10) : 0,
          reason: reason || "Community rules violation",
          type,
          metadata: {
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        },
      );

      const message =
        duration === 0
          ? "User permanently blocked"
          : `User blocked for ${duration} hours`;

      res.status(200).json({
        success: true,
        data: sanction,
        message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unblock a user
   * POST /api/admin/users/:userId/unblock
   */
  async unblockUser(
    req: Request<UserIdParams, BlockUnblockResponse>,
    res: Response<BlockUnblockResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const user = await userSanctionService.unblockUser(userId, currentUser);

      res.status(200).json({
        success: true,
        data: user,
        message: "User unblocked successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user sanction history
   * GET /api/admin/users/:userId/sanctions
   */
  async getUserSanctions(
    req: Request<UserIdParams, GetSanctionsResponse>,
    res: Response<GetSanctionsResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const sanctions = await userSanctionService.getUserSanctions(userId);

      res.status(200).json({
        success: true,
        data: sanctions,
        count: sanctions.length,
        message: "User sanctions history retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user block status
   * GET /api/admin/users/:userId/block-status
   */
  async getBlockStatus(
    req: Request<UserIdParams, GetBlockStatusResponse>,
    res: Response<GetBlockStatusResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const status = await userSanctionService.checkUserBlockStatus(userId);

      res.status(200).json({
        success: true,
        data: status,
        message: "User block status retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user with details (including last sanction)
   * GET /api/admin/users/:userId/details
   */
  async getUserDetails(
    req: Request<UserIdParams, GetUserDetailsResponse>,
    res: Response<GetUserDetailsResponse>,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.BadRequest("Invalid user ID format");
      }

      const user = await userService.getUserWithDetails(userId);

      res.status(200).json({
        success: true,
        data: user,
        message: "User details retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();
