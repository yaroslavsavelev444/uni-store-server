import { formatDate } from "date-fns";
import mongoose, { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { FeedbackModel, FileModel, UserModel } from "../models/index.models.js";
import { sendEmailNotification } from "../queues/taskQueues.js";
import type {
  FeedbackAssignedData,
  FeedbackStatusChangedData,
} from "../types/email.types.js";
import type {
  FeedbackPriority,
  FeedbackStatus,
  IFeedback,
} from "../types/feedback.types.js";
import type {
  AddInternalNoteParams,
  AddTagParams,
  AdminStatsResult,
  DeleteFeedbackParams,
  DeleteInternalNoteParams,
  ExportToCSVOptions,
  GetAllFeedbacksOptions,
  GetAllFeedbacksResult,
  GetFeedbackParams,
  MarkAsDuplicateParams,
  NotifyAdminsParams,
  NotifyAssignedUserParams,
  NotifyUserStatusChangeParams,
  RemoveTagParams,
  SubmitFeedbackData,
  SubmitFeedbackResult,
  UpdateInternalNoteParams,
  UpdatePriorityParams,
  UpdateStatusParams,
  UserStatsResult,
} from "../types/feedback-service.js";
import type { IUser } from "../types/user.types.js";
import fileStorageService from "./fileStorage.service.js";

class FeedbackService {
  // Пользовательские методы

  async submitFeedback(
    data: SubmitFeedbackData,
  ): Promise<SubmitFeedbackResult> {
    try {
      const {
        title,
        description,
        type,
        attachments = [], // массив строк (id файлов)
        userId,
        userEmail,
        userName,
        userRole,
        deviceInfo,
        ipAddress,
      } = data;
      if (!userId) {
        throw ApiError.NotFoundError("Пользователь не найден");
      }
      if (!title?.trim() || !description?.trim() || !type) {
        throw ApiError.BadRequest("Заголовок, описание и тип обязательны");
      }

      // attachments уже строки (UUID)
      const attachmentIds = attachments;

      // Проверяем существование файлов
      if (attachmentIds.length > 0) {
        const files = await FileModel.find({ _id: { $in: attachmentIds } });
        if (files.length !== attachmentIds.length) {
          throw ApiError.BadRequest("Некоторые файлы не существуют");
        }
      }

      let allowedIds: string[] = [];
      if (attachmentIds.length) {
        // Получаем всех админов (один раз за запрос — быстро)
        const admins = await UserModel.find({ role: "admin" }).select("_id");
        logger.debug({ message: "admins", admins });
        const adminIds = admins.map((a) => String(a._id));

        allowedIds = [userId, ...adminIds];

        await fileStorageService.grantAccessToRestrictedFiles(
          attachmentIds,
          allowedIds,
          "feedback",
        );
      }
      const priority = this.determinePriority(type, description);

      const feedbackData: Partial<IFeedback> = {
        title: title.trim(),
        description: description.trim(),
        type,
        userId: userId ? new Types.ObjectId(userId) : undefined,
        userEmail: userEmail?.toLowerCase()?.trim(),
        userName: userName?.trim(),
        userRole,
        priority,
        deviceInfo,
        ipAddress,
        createdBy: userId ? new Types.ObjectId(userId) : undefined,
        status: "new",
        // attachments: attachmentIds, // ← массив строк
      };

      const feedback = new FeedbackModel(feedbackData);
      await feedback.save();

      await fileStorageService.grantAccessToRestrictedFiles(
        attachmentIds,
        allowedIds,
        "feedback",
        String(feedback._id), // ← теперь entityId привязан к фидбеку
      );

      await this.notifyAdminsAboutNewFeedback({ feedback });

      return feedback;
    } catch (error) {
      logger.error({
        message: "[FEEDBACK_SUBMIT] Ошибка при создании фидбека",
        error,
      });
      if (error instanceof ApiError) throw error;
      throw ApiError.InternalServerError("Ошибка при создании фидбека");
    }
  }

  async getFeedback({
    id,
    userId,
    userRole,
  }: GetFeedbackParams): Promise<IFeedback> {
    try {
      // Добавляем populate('attachments') для подгрузки данных файлов
      const feedback = await FeedbackModel.findById(id)
        .populate<{ attachments: any[] }>("attachments") // типизация может быть расширена
        .lean<IFeedback>();

      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      const isOwner = feedback.userId && feedback.userId.toString() === userId;
      const isAdmin = ["admin", "moderator"].includes(userRole);

      if (!isOwner && !isAdmin) {
        throw ApiError.ForbiddenError("Нет доступа к этому фидбеку");
      }

      // Скрываем приватные заметки для не-админов
      if (!isAdmin && feedback.internalNotes) {
        feedback.internalNotes =
          feedback.internalNotes.filter((note) => !note.isPrivate) || [];
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[GET_FEEDBACK] Ошибка при получении фидбека",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при получении фидбека");
    }
  }

  // Административные методы

  async getAllFeedbacks(
    options: GetAllFeedbacksOptions = {},
  ): Promise<GetAllFeedbacksResult> {
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
        sortBy = "createdAt",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const sort: Record<string, 1 | -1> = {
        [sortBy]: sortOrder === "desc" ? -1 : 1,
      };

      const query: any = {};

      // Фильтры
      if (type) query.type = type;
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (assignedTo) query.assignedTo = new Types.ObjectId(assignedTo);

      // Диапазон дат
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }

      // Поиск
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { userName: { $regex: search, $options: "i" } },
          { userEmail: { $regex: search, $options: "i" } },
        ];
      }

      const [feedbacks, total] = await Promise.all([
        FeedbackModel.find(query)
          .populate<{ assignedTo: IUser }>("assignedTo", "name email role")
          .populate<{ createdBy: IUser }>("createdBy", "name email")
          .populate("attachments") // ← добавлено
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean<IFeedback[]>(),
        FeedbackModel.countDocuments(query),
      ]);

      // Агрегация по статусам для фильтров
      const statusStats = await FeedbackModel.aggregate([
        { $match: query },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);

      const priorityStats = await FeedbackModel.aggregate([
        { $match: query },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]);

      return {
        feedbacks,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
        filters: {
          status: statusStats.reduce(
            (acc, stat) => ({ ...acc, [stat._id]: stat.count }),
            {},
          ),
          priority: priorityStats.reduce(
            (acc, stat) => ({ ...acc, [stat._id]: stat.count }),
            {},
          ),
        },
      };
    } catch (error) {
      logger.error({
        message: "[GET_ALL_FEEDBACKS] Ошибка при получении фидбеков",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при получении фидбеков");
    }
  }

  async updateStatus({
    feedbackId,
    status,
    adminId,
    note,
  }: UpdateStatusParams): Promise<{
    feedback: IFeedback;
    previousStatus: FeedbackStatus;
  }> {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const feedback =
        await FeedbackModel.findById(feedbackId).session(session);

      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      const previousStatus = feedback.status;
      feedback.status = status;
      feedback.updatedBy = new Types.ObjectId(adminId);

      // Добавляем автоматическую заметку об изменении статуса
      if (note || previousStatus !== status) {
        if (!feedback.internalNotes) feedback.internalNotes = [];
        feedback.internalNotes.push({
          note: note || `Статус изменен с "${previousStatus}" на "${status}"`,
          createdBy: new Types.ObjectId(adminId),
          createdAt: new Date(),
          isPrivate: false,
        });
      }

      await feedback.save({ session });

      // Отправляем уведомление пользователю при изменении статуса
      if (feedback.userEmail && previousStatus !== status) {
        await this.notifyUserAboutStatusChange({
          feedback,
          oldStatus: previousStatus,
          newStatus: status,
        });
      }

      await session.commitTransaction();

      return {
        feedback: feedback.toObject(),
        previousStatus,
      };
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[UPDATE_STATUS] Ошибка при обновлении статуса",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при обновлении статуса");
    } finally {
      session.endSession();
    }
  }

  async updatePriority({
    feedbackId,
    priority,
    adminId,
  }: UpdatePriorityParams): Promise<IFeedback> {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $set: { priority },
          updatedBy: new Types.ObjectId(adminId),
        },
        { new: true, runValidators: true },
      );

      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[UPDATE_PRIORITY] Ошибка при обновлении приоритета",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при обновлении приоритета");
    }
  }

  async addInternalNote({
    feedbackId,
    note,
    adminId,
    isPrivate = false,
  }: AddInternalNoteParams): Promise<IFeedback> {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $push: {
            internalNotes: {
              note: note.trim(),
              createdBy: new Types.ObjectId(adminId),
              createdAt: new Date(),
              isPrivate,
            },
          },
          updatedBy: new Types.ObjectId(adminId),
        },
        { new: true, runValidators: true },
      );

      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[ADD_INTERNAL_NOTE] Ошибка при добавлении заметки",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при добавлении заметки");
    }
  }

  async updateInternalNote({
    feedbackId,
    noteId,
    note,
    adminId,
  }: UpdateInternalNoteParams): Promise<IFeedback> {
    try {
      const feedback = await FeedbackModel.findOneAndUpdate(
        {
          _id: feedbackId,
          "internalNotes._id": noteId,
          "internalNotes.createdBy": adminId,
        },
        {
          $set: {
            "internalNotes.$.note": note.trim(),
            "internalNotes.$.createdAt": new Date(),
          },
          updatedBy: new Types.ObjectId(adminId),
        },
        { new: true, runValidators: true },
      );

      if (!feedback) {
        throw ApiError.NotFoundError(
          "Заметка не найдена или нет прав для редактирования",
        );
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[UPDATE_INTERNAL_NOTE] Ошибка при обновлении заметки",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при обновлении заметки");
    }
  }

  async deleteInternalNote({
    feedbackId,
    noteId,
    adminId,
  }: DeleteInternalNoteParams): Promise<IFeedback> {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $pull: {
            internalNotes: { _id: noteId, createdBy: adminId },
          },
          updatedBy: new Types.ObjectId(adminId),
        },
        { new: true },
      );

      if (!feedback) {
        throw ApiError.NotFoundError(
          "Заметка не найдена или нет прав для удаления",
        );
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[DELETE_INTERNAL_NOTE] Ошибка при удалении заметки",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при удалении заметки");
    }
  }

  async addTag({ feedbackId, tag, adminId }: AddTagParams): Promise<IFeedback> {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $addToSet: { tags: tag.trim().toLowerCase() },
          updatedBy: new Types.ObjectId(adminId),
        },
        { new: true, runValidators: true },
      );

      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[ADD_TAG] Ошибка при добавлении тега",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при добавлении тега");
    }
  }

  async removeTag({
    feedbackId,
    tag,
    adminId,
  }: RemoveTagParams): Promise<IFeedback> {
    try {
      const feedback = await FeedbackModel.findByIdAndUpdate(
        feedbackId,
        {
          $pull: { tags: tag.trim().toLowerCase() },
          updatedBy: new Types.ObjectId(adminId),
        },
        { new: true },
      );

      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      return feedback;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[REMOVE_TAG] Ошибка при удалении тега",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при удалении тега");
    }
  }

  async markAsDuplicate({
    feedbackId,
    duplicateOfId,
    adminId,
    note,
  }: MarkAsDuplicateParams): Promise<IFeedback> {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Проверяем существование оригинального фидбека
      const originalFeedback =
        await FeedbackModel.findById(duplicateOfId).session(session);
      if (!originalFeedback) {
        throw ApiError.NotFoundError("Оригинальный фидбек не найден");
      }

      const feedback =
        await FeedbackModel.findById(feedbackId).session(session);
      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      // Нельзя помечать как дубликат самого себя
      if (feedbackId === duplicateOfId) {
        throw ApiError.BadRequest(
          "Нельзя пометить фидбек как дубликат самого себя",
        );
      }

      feedback.duplicateOf = new Types.ObjectId(duplicateOfId);
      feedback.status = "duplicate";
      feedback.updatedBy = new Types.ObjectId(adminId);

      // Добавляем ссылку в оригинальный фидбек
      await FeedbackModel.findByIdAndUpdate(duplicateOfId, {
        $addToSet: { relatedTo: new Types.ObjectId(feedbackId) },
      }).session(session);

      // Добавляем заметку
      if (note) {
        if (!feedback.internalNotes) feedback.internalNotes = [];
        feedback.internalNotes.push({
          note: `Помечено как дубликат #${duplicateOfId}. ${note}`,
          createdBy: new Types.ObjectId(adminId),
          createdAt: new Date(),
          isPrivate: false,
        });
      }

      await feedback.save({ session });
      await session.commitTransaction();

      return feedback;
    } catch (error) {
      await session.abortTransaction();
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[MARK_AS_DUPLICATE] Ошибка при помечении как дубликат",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при помечении как дубликат");
    } finally {
      session.endSession();
    }
  }

  async deleteFeedback({
    feedbackId,
    adminId,
  }: DeleteFeedbackParams): Promise<boolean> {
    try {
      const feedback = await FeedbackModel.findByIdAndDelete(feedbackId);

      if (!feedback) {
        throw ApiError.NotFoundError("Фидбек не найден");
      }

      logger.warn({
        message: "[DELETE_FEEDBACK] Фидбек удален",
        feedbackId,
        adminId,
      });

      return true;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        message: "[DELETE_FEEDBACK] Ошибка при удалении фидбека",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при удалении фидбека");
    }
  }

  // Вспомогательные методы

  async incrementViewCount(feedbackId: string): Promise<void> {
    try {
      await FeedbackModel.findByIdAndUpdate(feedbackId, {
        $inc: { viewCount: 1 },
      });
    } catch (error) {
      logger.error({
        message:
          "[INCREMENT_VIEW_COUNT] Ошибка при увеличении количества просмотров",
        error,
      });
    }
  }

  async getAdminStats(): Promise<AdminStatsResult> {
    try {
      return await FeedbackModel.getAdminStats();
    } catch (error) {
      logger.error({
        message: "[GET_ADMIN_STATS] Ошибка при получении статистики",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при получении статистики");
    }
  }

  async getUserStats(userId: string): Promise<UserStatsResult> {
    try {
      const userObjectId = new Types.ObjectId(userId);
      return await FeedbackModel.getStats(userObjectId);
    } catch (error) {
      logger.error({
        message:
          "[GET_USER_STATS] Ошибка при получении статистики пользователя",
        error,
      });
      throw ApiError.InternalServerError(
        "Ошибка при получении статистики пользователя",
      );
    }
  }

  async exportToCSV(options: ExportToCSVOptions = {}): Promise<string> {
    try {
      const { fromDate, toDate, type, status } = options;

      const query: any = {};
      if (type) query.type = type;
      if (status) query.status = status;

      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }

      const feedbacks = await FeedbackModel.find(query)
        .sort({ createdAt: -1 })
        .lean<IFeedback[]>();

      // Формируем CSV
      const headers = [
        "ID",
        "Title",
        "Type",
        "Status",
        "Priority",
        "User Email",
        "User Name",
        "Created At",
        "Updated At",
        "Description",
        "Tags",
      ];

      const rows = feedbacks.map((feedback) => [
        feedback._id.toString(),
        `"${feedback.title?.replace(/"/g, '""')}"`,
        feedback.type,
        feedback.status,
        feedback.priority,
        feedback.userEmail || "",
        `"${feedback.userName?.replace(/"/g, '""') || ""}"`,
        new Date(feedback.createdAt).toISOString(),
        new Date(feedback.updatedAt).toISOString(),
        `"${feedback.description?.replace(/"/g, '""')}"`,
        feedback.tags?.join(", ") || "",
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.join(",")),
      ].join("\n");

      return csvContent;
    } catch (error) {
      logger.error({
        message: "[EXPORT_TO_CSV] Ошибка при экспорте данных",
        error,
      });
      throw ApiError.InternalServerError("Ошибка при экспорте данных");
    }
  }

  // Утилиты

  determinePriority(type: string, description: string): FeedbackPriority {
    const descriptionLower = description.toLowerCase();

    // Критические баги
    if (
      type === "bug" &&
      (descriptionLower.includes("не работает") ||
        descriptionLower.includes("ошибка") ||
        descriptionLower.includes("критическ") ||
        descriptionLower.includes("срочн") ||
        descriptionLower.includes("urgent") ||
        descriptionLower.includes("critical"))
    ) {
      return "critical";
    }

    // Высокий приоритет для багов и важных фич
    if (
      type === "bug" ||
      descriptionLower.includes("важн") ||
      descriptionLower.includes("необход") ||
      descriptionLower.includes("нужн")
    ) {
      return "high";
    }

    // Средний приоритет для улучшений
    if (type === "improvement") {
      return "medium";
    }

    // Низкий по умолчанию
    return "low";
  }

  async notifyAdminsAboutNewFeedback({
    feedback,
  }: NotifyAdminsParams): Promise<void> {
    try {
      const admins = await UserModel.find({
        role: { $in: ["admin"] },
        email: { $exists: true, $ne: "" },
      })
        .select("email name")
        .lean<{ email: string; name: string }[]>();

      if (admins.length === 0) return;

      for (const admin of admins) {
        const formattedDate = formatDate(
          feedback.createdAt ? feedback.createdAt : new Date(),
          "dd.MM.yyyy HH:mm",
        );

        await sendEmailNotification(admin.email, "newFeedback", {
          feedbackId: feedback._id.toString(),
          title: feedback.title,
          type: feedback.type,
          userName: feedback.userName || "Анонимный пользователь",
          userEmail: feedback.userEmail || "Не указан",
          priority: feedback.priority,
          createdAtFormatted: formattedDate,
          createdAtRaw: feedback.createdAt
            ? feedback.createdAt.toISOString()
            : "",
          description:
            feedback.description.substring(0, 300) +
            (feedback.description.length > 300 ? "…" : ""),
          hasAttachments: !!feedback.attachments?.length,
        });
      }

      logger.info({
        message: "[NOTIFY_ADMINS] Уведомление о новом фидбеке отправлено",
        feedbackId: feedback._id,
      });
    } catch (error) {
      logger.error({
        message:
          "[NOTIFY_ADMINS] Ошибка при отправке уведомления о новом фидбеке",
        error,
      });
      // Не бросаем ошибку, чтобы не ломать основной поток
    }
  }

  async notifyUserAboutStatusChange({
    feedback,
    oldStatus,
    newStatus,
    comment, // добавим параметр (можно передавать из updateStatus)
  }: NotifyUserStatusChangeParams & { comment?: string }): Promise<void> {
    try {
      if (!feedback.userEmail) return;

      // Человекочитаемые статусы
      const statusMessages: Record<string, string> = {
        new: "получен и ожидает рассмотрения",
        in_progress: "взят в работу",
        resolved: "решён",
        closed: "закрыт",
        duplicate: "помечен как дубликат",
        wont_fix: "не будет исправлен",
      };

      // Формируем ссылку на фидбек в личном кабинете пользователя
      const feedbackUrl = `${process.env.CLIENT_URL}/profile/feedbacks/${feedback._id}`;
      const formattedDate = formatDate(new Date(), "dd.MM.yyyy HH:mm");

      const emailData: FeedbackStatusChangedData = {
        feedbackId: feedback._id.toString(),
        feedbackUrl,
        title: feedback.title,
        oldStatus: statusMessages[oldStatus] || oldStatus,
        newStatus: statusMessages[newStatus] || newStatus,
        oldStatusCode: oldStatus,
        newStatusCode: newStatus,
        comment: comment || undefined,
        userName: feedback.userName || "Уважаемый пользователь",
        updatedAtFormatted: formattedDate,
        updatedAtRaw: new Date().toISOString(),
      };

      await sendEmailNotification(
        feedback.userEmail,
        "feedbackStatusChanged",
        emailData,
      );
    } catch (error) {
      logger.error({
        message:
          "[NOTIFY_USER_ABOUT_STATUS_CHANGE] Ошибка при отправке уведомления",
        error,
      });
    }
  }

  async notifyAssignedUser({
    feedback,
    assignedUser,
  }: NotifyAssignedUserParams): Promise<void> {
    try {
      if (!assignedUser.email) return;

      // Получаем данные администратора, который назначил фидбек (feedback.updatedBy)
      let assignedByName = "Система";
      let assignedByEmail: string | undefined;
      if (feedback.updatedBy) {
        const assigner = await UserModel.findById(feedback.updatedBy)
          .select("name email")
          .lean();
        if (assigner) {
          assignedByName = assigner.name || "Администратор";
          assignedByEmail = assigner.email;
        }
      }

      // Ссылка на фидбек в админке
      const adminLink = `${process.env.ADMIN_URL}/feedbacks/${feedback._id}`;
      const formattedDate = formatDate(feedback.createdAt, "dd.MM.yyyy HH:mm");

      const emailData: FeedbackAssignedData = {
        feedbackId: feedback._id.toString(),
        feedbackUrl: adminLink,
        title: feedback.title,
        type: feedback.type,
        priority: feedback.priority,
        description:
          feedback.description.substring(0, 300) +
          (feedback.description.length > 300 ? "…" : ""),
        createdAtFormatted: formattedDate,
        createdAtRaw: feedback.createdAt.toISOString(),
        assignedToName: assignedUser.name || "Сотрудник",
        assignedByName,
        assignedByEmail,
      };

      await sendEmailNotification(
        assignedUser.email,
        "feedbackAssigned",
        emailData,
      );
    } catch (error) {
      logger.error({
        message:
          "[NOTIFY_ASSIGNED_USER] Ошибка при отправке уведомления о назначении",
        error,
      });
    }
  }
}

export default new FeedbackService();
