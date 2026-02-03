const ApiError = require('../exceptions/api-error');
const mongoose = require('mongoose');
const redisClient = require('../redis/redis.client');
const { RefundModel } = require('../models/index.models');
const { RefundStatus } = require('../models/refund-model');

class RefundService {
  constructor() {
    this.redisClient = redisClient;
    this.CACHE_TTL = 300; // 5 минут
  }

  async createRefund(refundData, userId) {
    try {
      // Валидация данных
      this.validateRefundData(refundData);
      
      // Проверяем наличие активных возвратов для этого заказа
      const activeRefund = await RefundModel.findOne({
        orderId: refundData.orderId,
        status: { $in: [RefundStatus.PENDING, RefundStatus.PROCESSING, RefundStatus.APPROVED] }
      });
      
      if (activeRefund) {
        throw ApiError.BadRequest('Для этого заказа уже существует активная заявка на возврат');
      }

      const refund = new RefundModel({
        ...refundData,
        userId,
        createdBy: userId,
        updatedBy: userId
      });

      await refund.save();
      
      // Инвалидируем кэш
      await this.invalidateUserRefundsCache(userId);
      await this.invalidateAdminRefundsCache();

      // Можно добавить отправку уведомлений здесь
      // await this.sendRefundCreatedNotifications(refund);

      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при создании заявки на возврат');
    }
  }

  async getUserRefunds(userId, query = {}) {
    const cacheKey = `refunds:user:${userId}:${JSON.stringify(query)}`;
    
    try {
      // Пробуем получить из кэша
      const cachedData = await this.redisClient.getJson(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      
      const {
        status,
        limit = 10,
        page = 1,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = query;
      
      const filter = { userId };
      
      if (status) {
        if (Array.isArray(status)) {
          filter.status = { $in: status };
        } else {
          filter.status = status;
        }
      }
      
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
      
      const skip = (page - 1) * limit;
      
      const [refunds, total] = await Promise.all([
        RefundModel.find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit))
          .populate('items.productId', 'title mainImage')
          .lean({ virtuals: true }),
        RefundModel.countDocuments(filter)
      ]);
      
      const result = {
        refunds: refunds.map(refund => this.formatRefundForResponse(refund)),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
      
      // Кэшируем результат
      await this.redisClient.setJson(cacheKey, result, this.CACHE_TTL);
      
      return result;
    } catch (error) {
      throw ApiError.DatabaseError('Ошибка при получении заявок на возврат');
    }
  }

  async getRefundById(id, userId, isAdmin = false) {
    try {
      const refund = await RefundModel.findById(id)
        .populate('items.productId', 'title sku mainImage')
        .populate('assignedTo', 'firstName lastName email')
        .lean({ virtuals: true });
      
      if (!refund) {
        throw ApiError.NotFound('Заявка на возврат не найдена');
      }
      
      // Проверка прав доступа
      if (!isAdmin && refund.userId.toString() !== userId.toString()) {
        throw ApiError.Forbidden('У вас нет доступа к этой заявке');
      }
      
      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при получении заявки на возврат');
    }
  }

  // Админские методы

  async getAllRefunds(query = {}) {
    const cacheKey = `refunds:admin:all:${JSON.stringify(query)}`;
    
    try {
      // Пробуем получить из кэша
      const cachedData = await this.redisClient.getJson(cacheKey);
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
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = query;
      
      const filter = {};
      
      // Фильтры
      if (status) {
        if (Array.isArray(status)) {
          filter.status = { $in: status };
        } else {
          filter.status = status;
        }
      }
      
      if (priority) filter.priority = priority;
      if (assignedTo) filter.assignedTo = assignedTo;
      if (orderNumber) filter.orderNumber = { $regex: orderNumber, $options: 'i' };
      if (userEmail) filter.userEmail = { $regex: userEmail, $options: 'i' };
      
      // Фильтр по дате
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
      
      const skip = (page - 1) * limit;
      
      const [refunds, total] = await Promise.all([
        RefundModel.find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit))
          .populate('items.productId', 'title sku')
          .populate('userId', 'firstName lastName email')
          .populate('assignedTo', 'firstName lastName email')
          .lean({ virtuals: true }),
        RefundModel.countDocuments(filter)
      ]);
      
      const result = {
        refunds: refunds.map(refund => this.formatRefundForResponse(refund)),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
      
      // Кэшируем результат
      await this.redisClient.setJson(cacheKey, result, this.CACHE_TTL);
      
      return result;
    } catch (error) {
      throw ApiError.DatabaseError('Ошибка при получении заявок на возврат');
    }
  }

  async updateRefundStatus(id, statusData, adminId, adminName) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID заявки');
    }
    
    if (!Object.values(RefundStatus).includes(statusData.status)) {
      throw ApiError.BadRequest('Некорректный статус заявки');
    }
    
    try {
      const refund = await RefundModel.findById(id);
      
      if (!refund) {
        throw ApiError.NotFound('Заявка на возврат не найдена');
      }
      
      // Проверяем можно ли изменить статус
      this.validateStatusTransition(refund.status, statusData.status);
      
      // Обновляем статус
      await refund.updateStatus(statusData.status, adminId, statusData.notes);
      
      // Если статус отклонен или закрыт, добавляем причину
      if (['rejected', 'closed'].includes(statusData.status) && statusData.reason) {
        refund.rejectionReason = statusData.reason;
      }
      
      // Если статус одобрен, устанавливаем сумму возврата
      if (statusData.status === RefundStatus.APPROVED && statusData.refundAmount) {
        refund.refundAmount = statusData.refundAmount;
        refund.refundMethod = statusData.refundMethod || refund.refundMethod;
      }
      
      // Если есть дополнительные заметки
      if (statusData.resolutionNotes) {
        refund.resolutionNotes = statusData.resolutionNotes;
      }
      
      refund.updatedBy = adminId;
      await refund.save();
      
      // Инвалидируем кэш
      await this.invalidateRefundCache(id);
      await this.invalidateUserRefundsCache(refund.userId);
      await this.invalidateAdminRefundsCache();
      
      // Можно добавить отправку уведомлений здесь
      // await this.sendRefundStatusUpdateNotifications(refund);
      
      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при обновлении статуса заявки');
    }
  }

  async assignRefundToAdmin(id, adminId, adminName, assignerId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID заявки');
    }
    
    try {
      const refund = await RefundModel.findById(id);
      
      if (!refund) {
        throw ApiError.NotFound('Заявка на возврат не найдена');
      }
      
      await refund.assignToAdmin(adminId, adminName);
      refund.updatedBy = assignerId;
      await refund.save();
      
      // Инвалидируем кэш
      await this.invalidateRefundCache(id);
      await this.invalidateAdminRefundsCache();
      
      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при назначении заявки');
    }
  }

  async addAdminNote(id, noteData, adminId, adminName) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest('Некорректный формат ID заявки');
    }
    
    try {
      const refund = await RefundModel.findById(id);
      
      if (!refund) {
        throw ApiError.NotFound('Заявка на возврат не найдена');
      }
      
      await refund.addAdminNote(noteData.note, adminId, adminName);
      refund.updatedBy = adminId;
      await refund.save();
      
      // Инвалидируем кэш
      await this.invalidateRefundCache(id);
      
      return this.formatRefundForResponse(refund);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.DatabaseError('Ошибка при добавлении заметки');
    }
  }

  async getRefundStats(timeframe = 'month') {
    const cacheKey = `refunds:stats:${timeframe}`;
    
    try {
      // Пробуем получить из кэша
      const cachedData = await this.redisClient.getJson(cacheKey);
      if (cachedData) {
        return cachedData;
      }
      
      const now = new Date();
      let startDate;
      
      switch (timeframe) {
        case 'day':
          startDate = new Date(now.setDate(now.getDate() - 1));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        default:
          startDate = new Date(now.setMonth(now.getMonth() - 1));
      }
      
      const stats = await RefundModel.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $facet: {
            statusCounts: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                  totalAmount: { $sum: "$totalAmount" }
                }
              }
            ],
            reasonCounts: [
              {
                $group: {
                  _id: "$reason",
                  count: { $sum: 1 }
                }
              }
            ],
            dailyStats: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                  },
                  count: { $sum: 1 },
                  amount: { $sum: "$totalAmount" }
                }
              },
              { $sort: { _id: 1 } }
            ],
            priorityStats: [
              {
                $group: {
                  _id: "$priority",
                  count: { $sum: 1 },
                  avgProcessingTime: { $avg: "$responseTime" }
                }
              }
            ]
          }
        }
      ]);
      
      // Форматируем результат
      const result = {
        timeframe,
        total: stats[0]?.statusCounts?.reduce((sum, item) => sum + item.count, 0) || 0,
        totalAmount: stats[0]?.statusCounts?.reduce((sum, item) => sum + item.totalAmount, 0) || 0,
        byStatus: stats[0]?.statusCounts || [],
        byReason: stats[0]?.reasonCounts || [],
        daily: stats[0]?.dailyStats || [],
        byPriority: stats[0]?.priorityStats || [],
        overdueCount: await RefundModel.countDocuments({
          status: { $in: [RefundStatus.PENDING, RefundStatus.PROCESSING] },
          dueDate: { $lt: new Date() }
        })
      };
      
      // Кэшируем на 10 минут
      await this.redisClient.setJson(cacheKey, result, 600);
      
      return result;
    } catch (error) {
      throw ApiError.DatabaseError('Ошибка при получении статистики');
    }
  }

  // Вспомогательные методы

  validateRefundData(data) {
    if (!data.orderId || !mongoose.Types.ObjectId.isValid(data.orderId)) {
      throw ApiError.BadRequest('Некорректный ID заказа');
    }
    
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw ApiError.BadRequest('Не указаны товары для возврата');
    }
    
    if (!data.description || data.description.length < 10) {
      throw ApiError.BadRequest('Описание должно содержать минимум 10 символов');
    }
    
    if (!data.reason || !Object.values(RefundReason).includes(data.reason)) {
      throw ApiError.BadRequest('Некорректная причина возврата');
    }
    
    // Проверяем медиафайлы
    if (data.media && Array.isArray(data.media)) {
      data.media.forEach(media => {
        if (!media.url || typeof media.url !== 'string') {
          throw ApiError.BadRequest('Некорректный формат медиафайла');
        }
      });
    }
  }

  validateStatusTransition(oldStatus, newStatus) {
    const allowedTransitions = {
      [RefundStatus.PENDING]: [RefundStatus.PROCESSING, RefundStatus.REJECTED, RefundStatus.CLOSED],
      [RefundStatus.PROCESSING]: [RefundStatus.APPROVED, RefundStatus.REJECTED, RefundStatus.CLOSED],
      [RefundStatus.APPROVED]: [RefundStatus.COMPLETED, RefundStatus.CLOSED],
      [RefundStatus.REJECTED]: [RefundStatus.CLOSED],
      [RefundStatus.COMPLETED]: [RefundStatus.CLOSED],
      [RefundStatus.CLOSED]: [] // Закрытые заявки нельзя менять
    };
    
    if (!allowedTransitions[oldStatus]?.includes(newStatus)) {
      throw ApiError.BadRequest(`Невозможно изменить статус с "${oldStatus}" на "${newStatus}"`);
    }
  }

  formatRefundForResponse(refund) {
    const refundObj = refund.toObject ? refund.toObject() : refund;
    
    // Добавляем виртуальные поля
    refundObj.formattedStatus = refund.formattedStatus;
    refundObj.formattedReason = refund.formattedReason;
    refundObj.isOverdue = refund.isOverdue;
    refundObj.daysOpen = refund.daysOpen;
    
    return refundObj;
  }

  // Методы для работы с кэшем

  async invalidateRefundCache(refundId) {
    const keys = await this.redisClient.keys(`refunds:*:${refundId}:*`);
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }
    
    // Удаляем все связанные с заявкой кэши
    await this.redisClient.del(`refund:${refundId}`);
  }

  async invalidateUserRefundsCache(userId) {
    const keys = await this.redisClient.keys(`refunds:user:${userId}:*`);
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }
  }

  async invalidateAdminRefundsCache() {
    const keys = await this.redisClient.keys('refunds:admin:*');
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }
    
    // Удаляем статистику
    await this.redisClient.deletePattern('refunds:stats:*');
  }

  async getRefundReasons() {
    return Object.entries(RefundReason).map(([key, value]) => ({
      key: value,
      label: this.getReasonLabel(value)
    }));
  }

  async getRefundStatuses() {
    return Object.entries(RefundStatus).map(([key, value]) => ({
      key: value,
      label: this.getStatusLabel(value)
    }));
  }

  getReasonLabel(reason) {
    const labels = {
      [RefundReason.DEFECTIVE]: 'Бракованный товар',
      [RefundReason.WRONG_ITEM]: 'Не тот товар',
      [RefundReason.DAMAGED]: 'Поврежден при доставке',
      [RefundReason.NOT_AS_DESCRIBED]: 'Не соответствует описанию',
      [RefundReason.LATE_DELIVERY]: 'Опоздание доставки',
      [RefundReason.CHANGE_OF_MIND]: 'Передумал',
      [RefundReason.OTHER]: 'Другое'
    };
    return labels[reason] || reason;
  }

  getStatusLabel(status) {
    const labels = {
      [RefundStatus.PENDING]: 'Ожидает рассмотрения',
      [RefundStatus.PROCESSING]: 'В обработке',
      [RefundStatus.APPROVED]: 'Одобрено',
      [RefundStatus.REJECTED]: 'Отклонено',
      [RefundStatus.COMPLETED]: 'Завершено',
      [RefundStatus.CLOSED]: 'Закрыто'
    };
    return labels[status] || status;
  }
}

module.exports = new RefundService();