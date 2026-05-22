// services/DiscountService.ts
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { DiscountModel } from "../models/index.models.js";
import type { ICartData, IDiscountDocument } from "../types/discount.types.js";

interface CreateDiscountParams {
  discountData: Record<string, unknown>;
  userId: string | Types.ObjectId;
}

interface UpdateDiscountParams {
  id: string | Types.ObjectId;
  discountData: Record<string, unknown>;
  userId: string | Types.ObjectId;
}

interface ListDiscountsFilters {
  search?: string;
  type?: string;
  isActive?: string | boolean;
  isCurrentlyActive?: boolean;
  startDate?: string | Date;
  endDate?: string | Date;
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

interface PaginatedDiscountsResult {
  discounts: IDiscountDocument[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

class DiscountService {
  async createDiscount({
    discountData,
    userId,
  }: CreateDiscountParams): Promise<IDiscountDocument> {
    try {
      if (discountData.code) {
        const existingDiscount = await DiscountModel.findOne({
          code: discountData.code,
        });
        if (existingDiscount) {
          throw ApiError.BadRequest("Скидка с таким кодом уже существует");
        }
      }

      if (!discountData.isUnlimited && discountData.endAt) {
        const startAt = discountData.startAt
          ? new Date(discountData.startAt as string | Date)
          : new Date();
        const endAt = new Date(discountData.endAt as string | Date);
        if (endAt <= startAt) {
          throw ApiError.BadRequest(
            "Дата окончания должна быть позже даты начала",
          );
        }
      }

      const discount = new DiscountModel({
        ...discountData,
        createdBy: userId,
        updatedBy: userId,
      });

      await discount.save();
      return discount;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка создания скидки:", error);
      throw error;
    }
  }

  async updateDiscount({
    id,
    discountData,
    userId,
  }: UpdateDiscountParams): Promise<IDiscountDocument> {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }

      if (discountData.code && discountData.code !== discount.code) {
        const existingDiscount = await DiscountModel.findOne({
          code: discountData.code,
          _id: { $ne: id },
        });
        if (existingDiscount) {
          throw ApiError.BadRequest("Скидка с таким кодом уже существует");
        }
      }

      if (
        discountData.endAt ||
        discountData.startAt ||
        discountData.isUnlimited !== undefined
      ) {
        const isUnlimited =
          discountData.isUnlimited !== undefined
            ? (discountData.isUnlimited as boolean)
            : discount.isUnlimited;

        if (!isUnlimited) {
          const startAt = discountData.startAt
            ? new Date(discountData.startAt as string | Date)
            : discount.startAt;
          const endAt = discountData.endAt
            ? new Date(discountData.endAt as string | Date)
            : discount.endAt;
          if (endAt && startAt && endAt <= startAt) {
            throw ApiError.BadRequest(
              "Дата окончания должна быть позже даты начала",
            );
          }
        }
      }

      for (const key of Object.keys(discountData)) {
        if (key !== "_id" && key !== "__v") {
          (discount as any)[key] = discountData[key];
        }
      }

      discount.updatedBy = userId as Types.ObjectId;
      discount.updatedAt = new Date();
      await discount.save();

      return discount;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка обновления скидки:", error);
      throw error;
    }
  }

  async getDiscountById(
    id: string | Types.ObjectId,
  ): Promise<IDiscountDocument> {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }
      return discount;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка получения скидки:", error);
      throw error;
    }
  }

  async listDiscounts(
    filters: ListDiscountsFilters = {},
  ): Promise<PaginatedDiscountsResult> {
    try {
      const {
        search,
        type,
        isActive,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = filters;

      const query: Record<string, unknown> = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
        ];
      }

      if (type) {
        query.type = type;
      }

      if (isActive !== undefined) {
        query.isActive = isActive === "true" || isActive === true;
      }

      if (startDate || endDate) {
        query.createdAt = {} as Record<string, Date>;
        if (startDate) (query.createdAt as any).$gte = new Date(startDate);
        if (endDate) (query.createdAt as any).$lte = new Date(endDate);
      }

      const sort: Record<string, 1 | -1> = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const skip = (Number(page) - 1) * Number(limit);

      const [discounts, total] = await Promise.all([
        DiscountModel.find(query)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .populate("createdBy", "email name")
          .populate("updatedBy", "email name"),
        DiscountModel.countDocuments(query),
      ]);

      return {
        discounts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      };
    } catch (error) {
      console.error(
        "[DISCOUNT_SERVICE] Ошибка получения списка скидок:",
        error,
      );
      throw error;
    }
  }

  async deleteDiscount(
    id: string | Types.ObjectId,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }

      if (discount.totalUses > 0) {
        throw ApiError.BadRequest(
          "Невозможно удалить скидку, которая уже использовалась. Деактивируйте её вместо удаления.",
        );
      }

      await discount.deleteOne();
      return { success: true, message: "Скидка успешно удалена" };
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка удаления скидки:", error);
      throw error;
    }
  }

  async changeDiscountStatus(
    id: string | Types.ObjectId,
    isActive: boolean,
  ): Promise<IDiscountDocument> {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }

      discount.isActive = isActive;
      discount.updatedAt = new Date();
      await discount.save();

      return discount;
    } catch (error) {
      console.error(
        "[DISCOUNT_SERVICE] Ошибка изменения статуса скидки:",
        error,
      );
      throw error;
    }
  }

  async getApplicableDiscounts(cartData: ICartData): Promise<
    Array<{
      discount: {
        _id: Types.ObjectId;
        name: string;
        type: string;
        discountPercent: number;
        minTotalQuantity?: number;
        minTotalAmount?: number;
      };
      applicable: boolean;
      discountAmount: number;
      message: string;
      needed?: { quantity?: number; amount?: number };
      current?: { quantity?: number; amount?: number };
    }>
  > {
    try {
      const now = new Date();
      const discounts = await DiscountModel.find({
        isActive: true,
        startAt: { $lte: now },
        $or: [{ isUnlimited: true }, { endAt: null }, { endAt: { $gte: now } }],
      }).sort({ priority: -1, createdAt: -1 });

      const result: Array<any> = [];

      for (const discount of discounts) {
        const calc = discount.calculateDiscount(cartData);
        result.push({
          discount: {
            _id: discount._id,
            name: discount.name,
            type: discount.type,
            discountPercent: discount.discountPercent,
            minTotalQuantity: discount.minTotalQuantity,
            minTotalAmount: discount.minTotalAmount,
          },
          ...calc,
        });

        if (calc.applicable) break;
      }

      return result;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка:", error);
      return [];
    }
  }

  async incrementDiscountUsage(
    discountId: string | Types.ObjectId,
    discountAmount: number,
  ): Promise<IDiscountDocument | void> {
    try {
      if (!discountId || !Types.ObjectId.isValid(discountId.toString())) {
        console.warn(
          `[DISCOUNT_SERVICE] Некорректный ID скидки: ${discountId}`,
        );
        return;
      }

      const result = await DiscountModel.findByIdAndUpdate(
        discountId,
        {
          $inc: {
            totalUses: 1,
            totalDiscountAmount: discountAmount || 0,
          },
          $set: { updatedAt: new Date() },
        },
        { new: true },
      );

      if (!result) {
        console.warn(`[DISCOUNT_SERVICE] Скидка с ID ${discountId} не найдена`);
        return;
      }

      console.log(`[DISCOUNT_SERVICE] Счетчик скидки ${discountId} увеличен:`, {
        totalUses: result.totalUses,
        totalDiscountAmount: result.totalDiscountAmount,
      });

      return result;
    } catch (error) {
      console.error(
        "[DISCOUNT_SERVICE] Ошибка увеличения счетчика использования:",
        error,
      );
      throw error;
    }
  }
}

export default new DiscountService();
