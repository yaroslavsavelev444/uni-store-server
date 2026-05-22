// services/delivery/pickup-point.service.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import mongoose, { type Types } from "mongoose";
import DeliveryCacheService from "../cache-service/delivery-cache.service.js";
import ApiError from "..//exceptions/api-error.js";
import logger from "../logger/logger.js";
import { PickupPointModel } from "../models/index.models.js";
import type { IPickupPoint } from "../types/pickupPoint.types.js";

interface PickupPointCreateData {
  name: string;
  address: {
    street: string;
    city: string;
    postalCode?: string;
    country?: string;
  };
  coordinates?: { lat?: number; lng?: number };
  workingHours?: string;
  contact?: { phone?: string; email?: string };
  description?: string;
  isActive?: boolean;
  isMain?: boolean;
  orderIndex?: number;
}

type PickupPointUpdateData = Partial<PickupPointCreateData>;

class PickupPointService {
  private cache = DeliveryCacheService;

  async getAllPickupPoints(includeInactive = false): Promise<IPickupPoint[]> {
    try {
      const cached = await this.cache.getPickupPoints();
      if (cached && !includeInactive) {
        return cached;
      }

      const query = includeInactive ? {} : { isActive: true };
      const points = await PickupPointModel.find(query)
        .sort({ isMain: -1, orderIndex: 1, createdAt: -1 })
        .lean();

      if (!includeInactive) {
        await this.cache.setPickupPoints(points);
      }

      return points as IPickupPoint[];
    } catch (error) {
      logger.error("[PickupPointService] Error getting pickup points:", error);
      throw ApiError.DatabaseError("Ошибка при получении пунктов самовывоза");
    }
  }

  async getMainPickupPoint(): Promise<IPickupPoint | null> {
    try {
      const point = await PickupPointModel.findOne({
        isMain: true,
        isActive: true,
      }).lean();
      return point as IPickupPoint | null;
    } catch (error) {
      logger.error(
        "[PickupPointService] Error getting main pickup point:",
        error,
      );
      throw ApiError.DatabaseError(
        "Ошибка при получении главного пункта самовывоза",
      );
    }
  }

  async getPickupPointById(id: string | Types.ObjectId): Promise<IPickupPoint> {
    try {
      const point = await PickupPointModel.findById(id).lean();
      if (!point) {
        throw ApiError.NotFoundError("Пункт самовывоза не найден");
      }
      return point as IPickupPoint;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(
        "[PickupPointService] Error getting pickup point by id:",
        error,
      );
      throw ApiError.DatabaseError("Ошибка при получении пункта самовывоза");
    }
  }

  async createPickupPoint(
    data: PickupPointCreateData,
    userId: string | Types.ObjectId,
  ): Promise<IPickupPoint> {
    try {
      const pointData: any = {
        ...data,
        createdBy: userId,
        updatedBy: userId,
      };

      const count = await PickupPointModel.countDocuments();
      if (count === 0) {
        pointData.isMain = true;
      }

      const point = new PickupPointModel(pointData);
      await point.save();

      await this.cache.invalidatePickupPoints();

      logger.info(
        `[PickupPointService] Pickup point created: ${point.name} by user ${userId}`,
      );
      return point.toObject() as IPickupPoint;
    } catch (error: any) {
      logger.error("[PickupPointService] Error creating pickup point:", error);
      if (error.code === 11000) {
        throw ApiError.BadRequest(
          "Пункт самовывоза с таким именем уже существует",
        );
      }
      throw ApiError.DatabaseError("Ошибка при создании пункта самовывоза");
    }
  }

  async updatePickupPoint(
    id: string | Types.ObjectId,
    data: PickupPointUpdateData,
    userId: string | Types.ObjectId,
  ): Promise<IPickupPoint> {
    try {
      const point = await PickupPointModel.findById(id);
      if (!point) {
        throw ApiError.NotFoundError("Пункт самовывоза не найден");
      }

      for (const [key, value] of Object.entries(data)) {
        if (key !== "_id" && key !== "__v" && value !== undefined) {
          (point as any)[key] = value;
        }
      }
      point.updatedBy = userId as any;
      await point.save();

      await this.cache.invalidatePickupPoints();

      logger.info(
        `[PickupPointService] Pickup point updated: ${point.name} by user ${userId}`,
      );
      return point.toObject() as IPickupPoint;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[PickupPointService] Error updating pickup point:", error);
      throw ApiError.DatabaseError("Ошибка при обновлении пункта самовывоза");
    }
  }

  async deletePickupPoint(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const point = await PickupPointModel.findById(id);
      if (!point) {
        throw ApiError.NotFoundError("Пункт самовывоза не найден");
      }

      if (point.isMain) {
        const nextPoint = await PickupPointModel.findOne({
          _id: { $ne: id },
          isActive: true,
        }).sort({ orderIndex: 1 });
        if (nextPoint) {
          nextPoint.isMain = true;
          await nextPoint.save();
        }
      }

      await PickupPointModel.findByIdAndDelete(id);
      await this.cache.invalidatePickupPoints();

      logger.info(
        `[PickupPointService] Pickup point deleted: ${point.name} by user ${userId}`,
      );
      return { success: true, message: "Пункт самовывоза удален" };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[PickupPointService] Error deleting pickup point:", error);
      throw ApiError.DatabaseError("Ошибка при удалении пункта самовывоза");
    }
  }

  async togglePickupPointStatus(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<IPickupPoint> {
    try {
      const point = await PickupPointModel.findById(id);
      if (!point) {
        throw ApiError.NotFoundError("Пункт самовывоза не найден");
      }

      point.isActive = !point.isActive;
      point.updatedBy = userId as any;
      await point.save();

      if (!point.isActive && point.isMain) {
        const nextPoint = await PickupPointModel.findOne({
          _id: { $ne: id },
          isActive: true,
        }).sort({ orderIndex: 1 });
        if (nextPoint) {
          nextPoint.isMain = true;
          await nextPoint.save();
        }
      }

      await this.cache.invalidatePickupPoints();

      logger.info(
        `[PickupPointService] Pickup point status toggled: ${point.name} to ${point.isActive} by user ${userId}`,
      );
      return point.toObject() as IPickupPoint;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(
        "[PickupPointService] Error toggling pickup point status:",
        error,
      );
      throw ApiError.DatabaseError(
        "Ошибка при изменении статуса пункта самовывоза",
      );
    }
  }

  async setAsMainPickupPoint(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ): Promise<IPickupPoint> {
    try {
      const point = await PickupPointModel.findById(id);
      if (!point) {
        throw ApiError.NotFoundError("Пункт самовывоза не найден");
      }
      if (!point.isActive) {
        throw ApiError.BadRequest("Нельзя сделать неактивный пункт главным");
      }

      await PickupPointModel.updateMany(
        { _id: { $ne: id } },
        { isMain: false },
      );
      point.isMain = true;
      point.updatedBy = userId as any;
      await point.save();

      await this.cache.invalidatePickupPoints();

      logger.info(
        `[PickupPointService] Pickup point set as main: ${point.name} by user ${userId}`,
      );
      return point.toObject() as IPickupPoint;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(
        "[PickupPointService] Error setting pickup point as main:",
        error,
      );
      throw ApiError.DatabaseError("Ошибка при установке главного пункта");
    }
  }

  async updatePickupPointsOrder(
    orderedIds: (string | Types.ObjectId)[],
    userId: string | Types.ObjectId,
  ): Promise<{ success: boolean; message: string }> {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      for (let i = 0; i < orderedIds.length; i++) {
        await PickupPointModel.findByIdAndUpdate(
          orderedIds[i],
          { orderIndex: i, updatedBy: userId },
          { session },
        );
      }
      await session.commitTransaction();
      await this.cache.invalidatePickupPoints();

      logger.info(
        `[PickupPointService] Pickup points order updated by user ${userId}`,
      );
      return { success: true, message: "Порядок пунктов обновлен" };
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        "[PickupPointService] Error updating pickup points order:",
        error,
      );
      throw ApiError.DatabaseError("Ошибка при обновлении порядка пунктов");
    } finally {
      session.endSession();
    }
  }
}

export default new PickupPointService();
