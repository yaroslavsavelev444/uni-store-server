// services/feedbackService.js
const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
const { FeedbackModel, UserModel } = require("../models/index.models");
const { sendEmailNotification } = require("../queues/taskQueues");
const mongoose = require("mongoose");
const FileManager = require("../utils/fileManager");

class FeedbackService {
  // Пользовательские методы

async submitFeedback(data) {
  let movedAttachments = [];
  
  try {
    const {
      title,
      description,
      type,
      attachments = [],
      userId,
      userEmail,
      userName,
      userRole,
      deviceInfo,
      ipAddress
    } = data;

    // Валидация
    if (!title?.trim() || !description?.trim() || !type) {
      throw ApiError.BadRequest("Заголовок, описание и тип обязательны");
    }

    // Перемещаем файлы из временной папки в постоянную
    if (attachments && attachments.length > 0) {
      console.log(`[FEEDBACK_SUBMIT] Перемещение ${attachments.length} файлов...`);
      
      // НОРМАЛИЗУЕМ имена файлов перед перемещением
      const normalizedAttachments = attachments.map(att => ({
        ...att,
        originalName: att.originalName ? FileManager.normalizeFileName(att.originalName) : att.tempName
      }));
      
      movedAttachments = await FileManager.moveTempFilesToPermanent(
        normalizedAttachments, 
        'feedback'
      );

      console.log(`[FEEDBACK_SUBMIT] Перемещено файлов: ${movedAttachments.filter(a => a.moved).length}`);
      
      // Проверяем успешность перемещения
      const failedAttachments = movedAttachments.filter(a => !a.moved);
      if (failedAttachments.length > 0) {
        console.warn('[FEEDBACK_SUBMIT] Некоторые файлы не удалось переместить:', 
          failedAttachments.map(f => ({ 
            name: f.originalName, 
            error: f.error,
            size: f.size 
          }))
        );
      }
    }

      // Определяем приоритет на основе типа
      const priority = this.determinePriority(type, description);

      // Создаем объект фидбека
      const feedbackData = {
        title: title.trim(),
        description: description.trim(),
        type,
        userId: userId ? new mongoose.Types.ObjectId(userId) : null,
        userEmail: userEmail?.toLowerCase()?.trim(),
        userName: userName?.trim(),
        userRole,
        priority,
        deviceInfo,
        ipAddress,
        createdBy: userId ? new mongoose.Types.ObjectId(userId) : null,
        status: 'new'
      };

      // Добавляем перемещенные вложения
      if (movedAttachments.length > 0) {
        feedbackData.attachments = movedAttachments
          .filter(a => a.moved)
          .map(att => ({
            url: att.url,
            tempName: att.tempName,
            permanentName: att.permanentName,
            originalName: att.originalName,
            size: att.size,
            mimeType: att.mimeType,
            uploadedAt: new Date(),
            movedAt: att.movedAt
          }));
      }

      const feedback = new FeedbackModel(feedbackData);
      await feedback.save();

      // Отправляем уведомление администраторам
      await this.notifyAdminsAboutNewFeedback(feedback);

      // Успешно создали фидбек, можно очистить все временные файлы этого пользователя
      try {
        await this.cleanupUserTempFiles(userId);
      } catch (cleanupError) {
        console.warn('[FEEDBACK_SUBMIT] Ошибка при очистке временных файлов:', cleanupError.message);
      }

      return feedback;
      
    } catch (error) {
      // Если произошла ошибка, откатываем перемещение файлов
      console.error('[FEEDBACK_SUBMIT] Ошибка, откатываем изменения...');
      
      try {
        await this.rollbackFileMoves(movedAttachments);
      } catch (rollbackError) {
        console.error('[FEEDBACK_SUBMIT] Ошибка при откате файлов:', rollbackError.message);
      }
      
      logger.error("[FEEDBACK_SUBMIT] Ошибка:", error);
      if (error instanceof ApiError) throw error;
      throw ApiError.InternalServerError("Ошибка при создании фидбека");
    }
  }

  /**
   * Откатывает перемещение файлов при ошибке
   */
  async rollbackFileMoves(movedAttachments = []) {
    const successfullyMoved = movedAttachments.filter(a => a.moved && a.permanentName);
    
    if (successfullyMoved.length === 0) {
      return;
    }

    console.log(`[ROLLBACK] Откатываем ${successfullyMoved.length} файлов...`);

    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const feedbackDir = path.join(uploadsDir, 'feedback');

    for (const attachment of successfullyMoved) {
      try {
        const permanentPath = path.join(feedbackDir, attachment.permanentName);
        await fs.unlink(permanentPath);
        console.log(`[ROLLBACK] Удален файл: ${attachment.permanentName}`);
      } catch (error) {
        console.warn(`[ROLLBACK] Не удалось удалить файл ${attachment.permanentName}:`, error.message);
      }
    }
  }

  /**
   * Очищает временные файлы пользователя
   */
  async cleanupUserTempFiles(userId) {
    try {
      if (!userId) return;
      
      // Находим все фидбеки пользователя
      const userFeedbacks = await FeedbackModel.find({ 
        userId: new mongoose.Types.ObjectId(userId),
        'attachments.tempName': { $exists: true }
      }).select('attachments');
      
      // Собираем все tempName из всех фидбеков пользователя
      const allTempNames = [];
      userFeedbacks.forEach(feedback => {
        feedback.attachments.forEach(att => {
          if (att.tempName && att.permanentName) {
            allTempNames.push(att.tempName);
          }
        });
      });
      
      // Удаляем временные файлы, которые уже перемещены
      if (allTempNames.length > 0) {
        await FileManager.cleanupTempFiles(allTempNames);
        console.log(`[CLEANUP] Очищено ${allTempNames.length} временных файлов пользователя ${userId}`);
      }
    } catch (error) {
      console.error('[CLEANUP] Ошибка при очистке временных файлов:', error);
      throw error;
    }
  }


  async getFeedback(id, userId, userRole) {
    try {
      const feedback = await FeedbackModel.findById(id).lean();
      
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      // Проверяем права доступа
      const isOwner = feedback.userId && feedback.userId.toString() === userId;
      const isAdmin = ['admin', 'moderator'].includes(userRole);
      
      if (!isOwner && !isAdmin) {
        throw ApiError.ForbiddenError("Нет доступа к этому фидбеку");
      }

      // Скрываем приватные заметки для не-админов
      if (!isAdmin) {
        feedback.internalNotes = feedback.internalNotes?.filter(note => !note.isPrivate) || [];
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[GET_FEEDBACK] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при получении фидбека");
    }
  }

  // Административные методы

  async getAllFeedbacks(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        type, 
        status, 
        priority, 
        assignedTo,
        fromDate,
        toDate,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;
      
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const query = {};
      
      // Фильтры
      if (type) query.type = type;
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (assignedTo) query.assignedTo = new mongoose.Types.ObjectId(assignedTo);
      
      // Диапазон дат
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }
      
      // Поиск
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { userName: { $regex: search, $options: 'i' } },
          { userEmail: { $regex: search, $options: 'i' } }
        ];
      }
      
      const [feedbacks, total] = await Promise.all([
        FeedbackModel.find(query)
          .populate('assignedTo', 'name email role')
          .populate('createdBy', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        FeedbackModel.countDocuments(query)
      ]);
      
      // Агрегация по статусам для фильтров
      const statusStats = await FeedbackModel.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
      
      const priorityStats = await FeedbackModel.aggregate([
        { $match: query },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]);

      return {
        feedbacks,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        filters: {
          status: statusStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {}),
          priority: priorityStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {})
        }
      };
    } catch (error) {
      logger.error("[GET_ALL_FEEDBACKS] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при получении фидбеков");
    }
  }

  async updateStatus(feedbackId, status, adminId, note) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const feedback = await FeedbackModel.findById(feedbackId).session(session);
      
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }
      
      const previousStatus = feedback.status;
      feedback.status = status;
      feedback.updatedBy = new mongoose.Types.ObjectId(adminId);
      
      // Добавляем автоматическую заметку об изменении статуса
      if (note || previousStatus !== status) {
        if (!feedback.internalNotes) feedback.internalNotes = [];
        feedback.internalNotes.push({
          note: note || `Статус изменен с "${previousStatus}" на "${status}"`,
          createdBy: new mongoose.Types.ObjectId(adminId),
          isPrivate: false
        });
      }
      
      await feedback.save({ session });
      
      // Отправляем уведомление пользователю при изменении статуса
      if (feedback.userEmail && previousStatus !== status) {
        await this.notifyUserAboutStatusChange(feedback, previousStatus, status);
      }
      
      await session.commitTransaction();
      
      return {
        ...feedback.toObject(),
        previousStatus
      };
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof ApiError) throw error;
      logger.error("[UPDATE_STATUS] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при обновлении статуса");
    } finally {
      session.endSession();
    }
  }

  async updatePriority(feedbackId, priority, adminId) {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        { 
          $set: { priority },
          updatedBy: new mongoose.Types.ObjectId(adminId)
        },
        { new: true, runValidators: true }
      );
      
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }
      
      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[UPDATE_PRIORITY] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при обновлении приоритета");
    }
  }


  async addInternalNote(feedbackId, note, adminId, isPrivate = false) {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $push: {
            internalNotes: {
              note: note.trim(),
              createdBy: new mongoose.Types.ObjectId(adminId),
              isPrivate
            }
          },
          updatedBy: new mongoose.Types.ObjectId(adminId)
        },
        { new: true, runValidators: true }
      );
      
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }
      
      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[ADD_INTERNAL_NOTE] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при добавлении заметки");
    }
  }

  async updateInternalNote(feedbackId, noteId, note, adminId) {
    try {
      const feedback = await FeedbackModel.findOneAndUpdate(
        {
          _id: feedbackId,
          'internalNotes._id': noteId,
          'internalNotes.createdBy': adminId
        },
        {
          $set: {
            'internalNotes.$.note': note.trim(),
            'internalNotes.$.updatedAt': new Date()
          },
          updatedBy: new mongoose.Types.ObjectId(adminId)
        },
        { new: true, runValidators: true }
      );
      
      if (!feedback) {
        throw ApiError.NotFoundError("Заметка не найдена или нет прав для редактирования");
      }
      
      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[UPDATE_INTERNAL_NOTE] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при обновлении заметки");
    }
  }

  async deleteInternalNote(feedbackId, noteId, adminId) {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $pull: {
            internalNotes: { _id: noteId, createdBy: adminId }
          },
          updatedBy: new mongoose.Types.ObjectId(adminId)
        },
        { new: true }
      );
      
      if (!feedback) {
        throw ApiError.NotFoundError("Заметка не найдена или нет прав для удаления");
      }
      
      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[DELETE_INTERNAL_NOTE] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при удалении заметки");
    }
  }

  async addTag(feedbackId, tag, adminId) {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $addToSet: { tags: tag.trim().toLowerCase() },
          updatedBy: new mongoose.Types.ObjectId(adminId)
        },
        { new: true, runValidators: true }
      );
      
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }
      
      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[ADD_TAG] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при добавлении тега");
    }
  }

  async removeTag(feedbackId, tag, adminId) {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $pull: { tags: tag.trim().toLowerCase() },
          updatedBy: new mongoose.Types.ObjectId(adminId)
        },
        { new: true }
      );
      
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }
      
      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[REMOVE_TAG] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при удалении тега");
    }
  }

  async markAsDuplicate(feedbackId, duplicateOfId, adminId, note) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      // Проверяем существование оригинального фидбека
      const originalFeedback = await FeedbackModel.findById(duplicateOfId).session(session);
      if (!originalFeedback) {
        throw ApiError.NotFoundError("Оригинальный фидбек не найден");
      }
      
      const feedback = await FeedbackModel.findById(feedbackId).session(session);
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }
      
      // Нельзя помечать как дубликат самого себя
      if (feedbackId === duplicateOfId) {
        throw ApiError.BadRequest("Нельзя пометить фидбек как дубликат самого себя");
      }
      
      feedback.duplicateOf = new mongoose.Types.ObjectId(duplicateOfId);
      feedback.status = 'duplicate';
      feedback.updatedBy = new mongoose.Types.ObjectId(adminId);
      
      // Добавляем ссылку в оригинальный фидбек
      await FeedbackModel.findByIdAndUpdate(
        duplicateOfId,
        {
          $addToSet: { relatedTo: new mongoose.Types.ObjectId(feedbackId) }
        }
      ).session(session);
      
      // Добавляем заметку
      if (note) {
        if (!feedback.internalNotes) feedback.internalNotes = [];
        feedback.internalNotes.push({
          note: `Помечено как дубликат #${duplicateOfId}. ${note}`,
          createdBy: new mongoose.Types.ObjectId(adminId),
          isPrivate: false
        });
      }
      
      await feedback.save({ session });
      await session.commitTransaction();
      
      return feedback;
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof ApiError) throw error;
      logger.error("[MARK_AS_DUPLICATE] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при помечении как дубликат");
    } finally {
      session.endSession();
    }
  }

  async deleteFeedback(feedbackId, adminId) {
    try {
      const feedback = await FeedbackModel.findByIdAndDelete(feedbackId);
      
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }
      
      logger.warn("Фидбек удален", {
        feedbackId,
        adminId,
        title: feedback.title,
        userId: feedback.userId
      });
      
      return true;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("[DELETE_FEEDBACK] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при удалении фидбека");
    }
  }

  // Вспомогательные методы

  async incrementViewCount(feedbackId) {
    try {
      await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        { $inc: { viewCount: 1 } }
      );
    } catch (error) {
      logger.error("[INCREMENT_VIEW_COUNT] Ошибка:", error);
    }
  }

  async getAdminStats() {
    try {
      return await FeedbackModel.getAdminStats();
    } catch (error) {
      logger.error("[GET_ADMIN_STATS] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при получении статистики");
    }
  }

  async getUserStats(userId) {
    try {
      return await FeedbackModel.getStats(userId);
    } catch (error) {
      logger.error("[GET_USER_STATS] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при получении статистики пользователя");
    }
  }

  async exportToCSV(options = {}) {
    try {
      const { fromDate, toDate, type, status } = options;
      
      const query = {};
      if (type) query.type = type;
      if (status) query.status = status;
      
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }
      
      const feedbacks = await FeedbackModel.find(query)
        .sort({ createdAt: -1 })
        .lean();
      
      // Формируем CSV
      const headers = [
        'ID', 'Title', 'Type', 'Status', 'Priority', 'User Email', 
        'User Name', 'Created At', 'Updated At', 'Description', 'Tags'
      ];
      
      const rows = feedbacks.map(feedback => [
        feedback._id,
        `"${feedback.title?.replace(/"/g, '""')}"`,
        feedback.type,
        feedback.status,
        feedback.priority,
        feedback.userEmail,
        `"${feedback.userName?.replace(/"/g, '""')}"`,
        new Date(feedback.createdAt).toISOString(),
        new Date(feedback.updatedAt).toISOString(),
        `"${feedback.description?.replace(/"/g, '""')}"`,
        feedback.tags?.join(', ') || ''
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');
      
      return csvContent;
    } catch (error) {
      logger.error("[EXPORT_TO_CSV] Ошибка:", error);
      throw ApiError.InternalServerError("Ошибка при экспорте данных");
    }
  }

  // Утилиты

  determinePriority(type, description) {
    const descriptionLower = description.toLowerCase();
    
    // Критические баги
    if (type === 'bug' && (
      descriptionLower.includes('не работает') ||
      descriptionLower.includes('ошибка') ||
      descriptionLower.includes('критическ') ||
      descriptionLower.includes('срочн') ||
      descriptionLower.includes('urgent') ||
      descriptionLower.includes('critical')
    )) {
      return 'critical';
    }
    
    // Высокий приоритет для багов и важных фич
    if (type === 'bug' || 
        descriptionLower.includes('важн') ||
        descriptionLower.includes('необход') ||
        descriptionLower.includes('нужн')) {
      return 'high';
    }
    
    // Средний приоритет для улучшений
    if (type === 'improvement') {
      return 'medium';
    }
    
    // Низкий по умолчанию
    return 'low';
  }

  async notifyAdminsAboutNewFeedback(feedback) {
    try {
      const admins = await UserModel.find({ 
        role: { $in: ['admin'] },
        email: { $exists: true, $ne: '' }
      }).select('email name').lean();
      
      if (admins.length === 0) return;
      
      for (const admin of admins) {
        await sendEmailNotification(admin.email, 'newFeedback', {
  feedbackId: feedback._id,
  title: feedback.title,
  type: feedback.type,
  userName: feedback.userName || 'Анонимный пользователь',
  userEmail: feedback.userEmail || 'Не указан',
  priority: feedback.priority,
  createdAt: feedback.createdAt,
  description: feedback.description.substring(0, 200) + '...'
});
      }
      
      logger.info("Уведомления администраторам отправлены", {
        feedbackId: feedback._id,
        adminCount: admins.length
      });
    } catch (error) {
      logger.error("[NOTIFY_ADMINS] Ошибка:", error);
      // Не бросаем ошибку, чтобы не ломать основной поток
    }
  }

  async notifyUserAboutStatusChange(feedback, oldStatus, newStatus) {
    try {
      if (!feedback.userEmail) return;
      
      const statusMessages = {
        'new': 'получен и ожидает рассмотрения',
        'in_progress': 'взяли в работу',
        'resolved': 'решен',
        'closed': 'закрыт',
        'duplicate': 'помечен как дубликат',
        'wont_fix': 'не будет исправлен'
      };
      
      await sendEmailNotification(feedback.userEmail, 'feedbackStatusChanged', {
        feedbackId: feedback._id,
        title: feedback.title,
        oldStatus: statusMessages[oldStatus] || oldStatus,
        newStatus: statusMessages[newStatus] || newStatus,
        userName: feedback.userName,
        updatedAt: new Date()
      });
    } catch (error) {
      logger.error("[NOTIFY_USER_STATUS_CHANGE] Ошибка:", error);
    }
  }

  async notifyAssignedUser(feedback, assignedUser) {
    try {
      if (!assignedUser.email) return;
      
      await sendEmailNotification(assignedUser.email, 'feedbackAssigned', {
        feedbackId: feedback._id,
        title: feedback.title,
        type: feedback.type,
        priority: feedback.priority,
        assignedBy: feedback.updatedBy, // ID админа
        userName: assignedUser.name,
        description: feedback.description.substring(0, 150) + '...',
        createdAt: feedback.createdAt
      });
    } catch (error) {
      logger.error("[NOTIFY_ASSIGNED_USER] Ошибка:", error);
    }
  }
}

module.exports = new FeedbackService();