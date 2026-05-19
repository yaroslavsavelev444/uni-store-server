// services/refund-service.ts
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import {
  RefundModel,
  RefundReason,
  RefundStatus,
} from "../models/refund-model.js";
import redisClient from "../redis/redis.client.js";
import type {
  IRefund,
  RefundDocument,
  RefundStatusType,
} from "../types/refund.types.js";
import type {
  AddAdminNoteInput,
  AdminGetRefundsQuery,
  CreateRefundInput,
  GetRefundsQuery,
  PaginatedRefundsResponse,
  RefundResponse,
  RefundStatsResponse,
  UpdateRefundStatusInput,
} from "../types/refund-service.types.js";

/**
 * Сервис для управления заявками на возврат
 */
class RefundService {
  private readonly redisClient: typeof redisClient;
  private readonly CACHE_TTL: number = 300; // 5 минут

  constructor() {
    this.redisClient = redisClient;
  }

  /**
   * Создание новой заявки на возврат
   */
  async createRefund(
    refundData: CreateRefundInput,
    userId: string,
  ): Promise<RefundResponse> {
    try {
      this.validateRefundData(refundData);

      // Проверка наличия активных возвратов для этого заказа
      const activeRefund = await RefundModel.findOne({
        orderId: refundData.orderId,
        status: {
          $in: [
            RefundStatus.PENDING,
            RefundStatus.PROCESSING,
            RefundStatus.APPROVED,
          ],
        },
      });

      if (activeRefund) {
        throw ApiError.BadRequest(
          "Для этого заказа уже существует активная заявка на возврат",
        );
      }

      const refund = new RefundModel({
        ...refundData,
        userId,
        createdBy: userId,
        updatedBy: userId,
      });

      await refund.save();

      // Инвалидация кэшей
      await this.invalidateUserRefundsCache(userId);
      await this.invalidateAdminRefundsCache();

      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError("Ошибка при создании заявки на возврат");
    }
  }

  /**
   * Получение заявок пользователя с пагинацией и фильтрацией
   */
  async getUserRefunds(
    userId: string,
    query: GetRefundsQuery = {},
  ): Promise<PaginatedRefundsResponse> {
    const cacheKey = `refunds:user:${userId}:${JSON.stringify(query)}`;

    try {
      const cachedData =
        await this.redisClient.getJson<PaginatedRefundsResponse>(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const {
        status,
        limit = 10,
        page = 1,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = query;

      const filter: Record<string, unknown> = { userId };

      if (status) {
        filter.status = Array.isArray(status) ? { $in: status } : status;
      }

      const sortOptions: Record<string, 1 | -1> = {
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      };

      const skip = (page - 1) * limit;
      const limitNum = Number(limit);

      const [refunds, total] = await Promise.all([
        RefundModel.find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .populate("items.productId", "title mainImage")
          .lean({ virtuals: true }),
        RefundModel.countDocuments(filter),
      ]);

      const result: PaginatedRefundsResponse = {
        refunds: (refunds as unknown as IRefund[]).map((refund) =>
          this.formatRefundForResponse(refund),
        ),
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
          hasNext: page * limitNum < total,
          hasPrev: page > 1,
        },
      };

      await this.redisClient.setJson(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error) {
      throw ApiError.DatabaseError("Ошибка при получении заявок на возврат");
    }
  }

  /**
   * Получение заявки по ID с проверкой прав
   */
  async getRefundById(
    id: string,
    userId: string,
    isAdmin = false,
  ): Promise<RefundResponse> {
    try {
      const refund = await RefundModel.findById(id)
        .populate("items.productId", "title sku mainImage")
        .populate("assignedTo", "firstName lastName email")
        .lean({ virtuals: true });

      if (!refund) {
        throw ApiError.NotFoundError("Заявка на возврат не найдена");
      }

      if (!isAdmin && refund.userId.toString() !== userId.toString()) {
        throw ApiError.ForbiddenError("У вас нет доступа к этой заявке");
      }

      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError("Ошибка при получении заявки на возврат");
    }
  }

  // ==================== Административные методы ====================

  async getAllRefunds(
    query: AdminGetRefundsQuery = {},
  ): Promise<PaginatedRefundsResponse> {
    const cacheKey = `refunds:admin:all:${JSON.stringify(query)}`;

    try {
      const cachedData =
        await this.redisClient.getJson<PaginatedRefundsResponse>(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const {
        status,
        priority,
        assignedTo,
        orderNumber,
        userEmail,
        startDate,
        endDate,
        limit = 50,
        page = 1,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = query;

      const filter: Record<string, unknown> = {};

      if (status) {
        filter.status = Array.isArray(status) ? { $in: status } : status;
      }
      if (priority) filter.priority = priority;
      if (assignedTo) filter.assignedTo = assignedTo;
      if (orderNumber)
        filter.orderNumber = { $regex: orderNumber, $options: "i" };
      if (userEmail) filter.userEmail = { $regex: userEmail, $options: "i" };

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate)
          (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
        if (endDate)
          (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
      }

      const sortOptions: Record<string, 1 | -1> = {
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      };

      const skip = (page - 1) * limit;
      const limitNum = Number(limit);

      const [refunds, total] = await Promise.all([
        RefundModel.find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .populate("items.productId", "title sku")
          .populate("userId", "firstName lastName email")
          .populate("assignedTo", "firstName lastName email")
          .lean({ virtuals: true }),
        RefundModel.countDocuments(filter),
      ]);

      const result: PaginatedRefundsResponse = {
        refunds: (refunds as unknown as IRefund[]).map((refund) =>
          this.formatRefundForResponse(refund),
        ),
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
          hasNext: page * limitNum < total,
          hasPrev: page > 1,
        },
      };

      await this.redisClient.setJson(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error) {
      throw ApiError.DatabaseError("Ошибка при получении заявок на возврат");
    }
  }

  async updateRefundStatus(
    id: string,
    statusData: UpdateRefundStatusInput,
    adminId: string,
    _adminName: string, // не используется, но оставлено для совместимости
  ): Promise<RefundResponse> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный формат ID заявки");
    }

    if (!Object.values(RefundStatus).includes(statusData.status)) {
      throw ApiError.BadRequest("Некорректный статус заявки");
    }

    try {
      const refund = await RefundModel.findById(id);
      if (!refund) {
        throw ApiError.NotFoundError("Заявка на возврат не найдена");
      }

      this.validateStatusTransition(refund.status, statusData.status);

      // Обновление статуса через метод модели
      await refund.updateStatus(
        statusData.status,
        new Types.ObjectId(adminId),
        statusData.notes,
      );

      // Дополнительные поля
      if (
        ["rejected", "closed"].includes(statusData.status) &&
        statusData.reason
      ) {
        refund.rejectionReason = statusData.reason;
      }
      if (
        statusData.status === RefundStatus.APPROVED &&
        statusData.refundAmount
      ) {
        refund.refundAmount = statusData.refundAmount;
      }
      if (statusData.resolutionNotes) {
        refund.resolutionNotes = statusData.resolutionNotes;
      }

      refund.updatedBy = new Types.ObjectId(adminId);
      await refund.save();

      // Инвалидация кэшей
      await this.invalidateRefundCache(id);
      await this.invalidateUserRefundsCache(refund.userId.toString());
      await this.invalidateAdminRefundsCache();

      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError("Ошибка при обновлении статуса заявки");
    }
  }

  async assignRefundToAdmin(
    id: string,
    adminId: string,
    _adminName: string,
    assignerId: string,
  ): Promise<RefundResponse> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный формат ID заявки");
    }

    try {
      const refund = await RefundModel.findById(id);
      if (!refund) {
        throw ApiError.NotFoundError("Заявка на возврат не найдена");
      }

      await refund.assignToAdmin(new Types.ObjectId(adminId), _adminName);
      refund.updatedBy = new Types.ObjectId(assignerId);
      await refund.save();

      await this.invalidateRefundCache(id);
      await this.invalidateAdminRefundsCache();

      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError("Ошибка при назначении заявки");
    }
  }

  async addAdminNote(
    id: string,
    noteData: AddAdminNoteInput,
    adminId: string,
    adminName: string,
  ): Promise<RefundResponse> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный формат ID заявки");
    }

    try {
      const refund = await RefundModel.findById(id);
      if (!refund) {
        throw ApiError.NotFoundError("Заявка на возврат не найдена");
      }

      await refund.addAdminNote(
        noteData.note,
        new Types.ObjectId(adminId),
        adminName,
      );
      refund.updatedBy = new Types.ObjectId(adminId);
      await refund.save();

      await this.invalidateRefundCache(id);
      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError("Ошибка при добавлении заметки");
    }
  }

  async getRefundStats(
    timeframe: "day" | "week" | "month" | "year" = "month",
  ): Promise<RefundStatsResponse> {
    const cacheKey = `refunds:stats:${timeframe}`;

    try {
      const cachedData =
        await this.redisClient.getJson<RefundStatsResponse>(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const now = new Date();
      let startDate: Date;

      switch (timeframe) {
        case "day":
          startDate = new Date(now.setDate(now.getDate() - 1));
          break;
        case "week":
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case "month":
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case "year":
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        default:
          startDate = new Date(now.setMonth(now.getMonth() - 1));
      }

      const stats = await RefundModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $facet: {
            statusCounts: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                  totalAmount: { $sum: "$totalAmount" },
                },
              },
            ],
            reasonCounts: [{ $group: { _id: "$reason", count: { $sum: 1 } } }],
            dailyStats: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                  },
                  count: { $sum: 1 },
                  amount: { $sum: "$totalAmount" },
                },
              },
              { $sort: { _id: 1 } },
            ],
            priorityStats: [
              {
                $group: {
                  _id: "$priority",
                  count: { $sum: 1 },
                  avgProcessingTime: { $avg: "$responseTime" },
                },
              },
            ],
          },
        },
      ]);

      const result: RefundStatsResponse = {
        timeframe,
        total:
          stats[0]?.statusCounts?.reduce(
            (sum: number, item: { count: number }) => sum + item.count,
            0,
          ) || 0,
        totalAmount:
          stats[0]?.statusCounts?.reduce(
            (sum: number, item: { totalAmount: number }) =>
              sum + item.totalAmount,
            0,
          ) || 0,
        byStatus: stats[0]?.statusCounts || [],
        byReason: stats[0]?.reasonCounts || [],
        daily: stats[0]?.dailyStats || [],
        byPriority: stats[0]?.priorityStats || [],
        overdueCount: await RefundModel.countDocuments({
          status: { $in: [RefundStatus.PENDING, RefundStatus.PROCESSING] },
          dueDate: { $lt: new Date() },
        }),
      };

      await this.redisClient.setJson(cacheKey, result, 600);
      return result;
    } catch (error) {
      throw ApiError.DatabaseError("Ошибка при получении статистики");
    }
  }

  // ==================== Вспомогательные методы ====================

  private validateRefundData(data: CreateRefundInput): void {
    if (!data.orderId || !Types.ObjectId.isValid(data.orderId)) {
      throw ApiError.BadRequest("Некорректный ID заказа");
    }
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw ApiError.BadRequest("Не указаны товары для возврата");
    }
    if (!data.description || data.description.length < 10) {
      throw ApiError.BadRequest(
        "Описание должно содержать минимум 10 символов",
      );
    }
    if (!data.reason || !Object.values(RefundReason).includes(data.reason)) {
      throw ApiError.BadRequest("Некорректная причина возврата");
    }
    if (data.media && Array.isArray(data.media)) {
      for (const media of data.media) {
        if (!media.url || typeof media.url !== "string") {
          throw ApiError.BadRequest("Некорректный формат медиафайла");
        }
      }
    }
  }

  private validateStatusTransition(
    oldStatus: RefundStatusType,
    newStatus: RefundStatusType,
  ): void {
    const allowedTransitions: Record<RefundStatusType, RefundStatusType[]> = {
      [RefundStatus.PENDING]: [
        RefundStatus.PROCESSING,
        RefundStatus.REJECTED,
        RefundStatus.CLOSED,
      ],
      [RefundStatus.PROCESSING]: [
        RefundStatus.APPROVED,
        RefundStatus.REJECTED,
        RefundStatus.CLOSED,
      ],
      [RefundStatus.APPROVED]: [RefundStatus.COMPLETED, RefundStatus.CLOSED],
      [RefundStatus.REJECTED]: [RefundStatus.CLOSED],
      [RefundStatus.COMPLETED]: [RefundStatus.CLOSED],
      [RefundStatus.CLOSED]: [],
    };

    if (!allowedTransitions[oldStatus]?.includes(newStatus)) {
      throw ApiError.BadRequest(
        `Невозможно изменить статус с "${oldStatus}" на "${newStatus}"`,
      );
    }
  }

  private formatRefundForResponse(
    refund: IRefund | RefundDocument,
  ): RefundResponse {
    const refundObj =
      "toObject" in refund ? refund.toObject() : (refund as IRefund);

    // Безопасное получение виртуальных полей
    const getVirtual = <T>(value: unknown, defaultValue: T): T =>
      (value as T) ?? defaultValue;

    // Формируем ответ с правильным id и виртуальными полями
    return {
      ...refundObj,
      id: refundObj._id.toString(),
      formattedStatus: getVirtual(
        (refund as unknown as Record<string, unknown>).formattedStatus,
        refundObj.status,
      ),
      formattedReason: getVirtual(
        (refund as unknown as Record<string, unknown>).formattedReason,
        refundObj.reason,
      ),
      isOverdue: getVirtual(
        (refund as unknown as Record<string, unknown>).isOverdue,
        false,
      ),
      daysOpen: getVirtual(
        (refund as unknown as Record<string, unknown>).daysOpen,
        0,
      ),
    } as unknown as RefundResponse;
  }

  // ==================== Методы инвалидации кэша ====================

  private async invalidateRefundCache(refundId: string): Promise<void> {
    const keys = await this.redisClient.keys(`refunds:*:${refundId}:*`);
    if (keys.length) {
      await this.redisClient.del(...keys);
    }
    await this.redisClient.del(`refund:${refundId}`);
  }

  private async invalidateUserRefundsCache(userId: string): Promise<void> {
    const keys = await this.redisClient.keys(`refunds:user:${userId}:*`);
    if (keys.length) {
      await this.redisClient.del(...keys);
    }
  }

  private async invalidateAdminRefundsCache(): Promise<void> {
    const keys = await this.redisClient.keys("refunds:admin:*");
    if (keys.length) {
      await this.redisClient.del(...keys);
    }
    await this.redisClient.deletePattern("refunds:stats:*");
  }

  async getRefundReasons(): Promise<{ key: string; label: string }[]> {
    return Object.values(RefundReason).map((reason) => ({
      key: reason,
      label: this.getReasonLabel(reason),
    }));
  }

  async getRefundStatuses(): Promise<{ key: string; label: string }[]> {
    return Object.values(RefundStatus).map((status) => ({
      key: status,
      label: this.getStatusLabel(status),
    }));
  }

  private getReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      [RefundReason.DEFECTIVE]: "Бракованный товар",
      [RefundReason.WRONG_ITEM]: "Не тот товар",
      [RefundReason.DAMAGED]: "Поврежден при доставке",
      [RefundReason.NOT_AS_DESCRIBED]: "Не соответствует описанию",
      [RefundReason.LATE_DELIVERY]: "Опоздание доставки",
      [RefundReason.CHANGE_OF_MIND]: "Передумал",
      [RefundReason.OTHER]: "Другое",
    };
    return labels[reason] || reason;
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      [RefundStatus.PENDING]: "Ожидает рассмотрения",
      [RefundStatus.PROCESSING]: "В обработке",
      [RefundStatus.APPROVED]: "Одобрено",
      [RefundStatus.REJECTED]: "Отклонено",
      [RefundStatus.COMPLETED]: "Завершено",
      [RefundStatus.CLOSED]: "Закрыто",
    };
    return labels[status] || status;
  }
}

export default new RefundService();
