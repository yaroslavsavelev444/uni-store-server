import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import sanitize from "sanitize-filename";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import feedbackService from "../services/feedbackService.js";
import type {
  AddInternalNoteBody,
  AddInternalNoteResponse,
  AddTagBody,
  AddTagResponse,
  AdminStatsResponse,
  DeleteResponse,
  ExportToCSVQuery,
  FeedbackResponse,
  GetAllFeedbacksQuery,
  GetAllFeedbacksResponse,
  MarkAsDuplicateBody,
  ParamsWithId,
  ParamsWithIdAndNoteId,
  ParamsWithIdAndTag,
  SubmitFeedbackBody,
  SubmitFeedbackResponse,
  UpdateInternalNoteBody,
  UpdatePriorityBody,
  UpdatePriorityResponse,
  UpdateStatusBody,
  UpdateStatusResponse,
  UserStatsResponse,
} from "../types/controllers/feedback-controller.js";
import type { IFeedback } from "../types/feedback.types.js";
import type { UserRole } from "../types/user.types.js";

const sanitizeInput = (data: any): any => {
  if (typeof data === "string") {
    return sanitize(data.trim());
  }
  return data;
};

// ==================== Пользовательские маршруты ====================

export const submitFeedback = async (
  req: Request<{}, SubmitFeedbackResponse, SubmitFeedbackBody>,
  res: Response<SubmitFeedbackResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.body.title || !req.body.description || !req.body.type) {
      throw ApiError.BadRequest("Заголовок, описание и тип обязательны");
    }
    if (req.body.attachments && req.body.attachments.length > 5) {
      throw ApiError.BadRequest("Максимум 5 вложений");
    }

    const userRole = (req.user?.role || "user") as Exclude<UserRole, "bot">;

    const feedbackData = {
      title: sanitizeInput(req.body.title),
      description: sanitizeInput(req.body.description),
      type: req.body.type,
      attachments: req.body.attachments || [],
      userId: req.user!.id,
      userEmail: sanitizeInput(req.user!.email.toLowerCase()),
      userName: req.user!.name ? sanitizeInput(req.user!.name) : "",
      userRole,
      deviceInfo: {
        userAgent: req.headers["user-agent"] || "",
        os: (req as any).useragent?.os || "",
        browser: (req as any).useragent?.browser || "",
      },
      ipAddress: req.ip,
    };

    const feedback = await feedbackService.submitFeedback(feedbackData);

    logger.info({
      message: "Новый фидбек",
      userId: req.user!.id,
      feedbackId: feedback._id,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      message: "Спасибо за обратную связь! Мы получили ваше сообщение.",
      feedbackId: feedback._id.toString(),
      status: feedback.status,
      priority: feedback.priority,
    });
  } catch (error) {
    logger.error({
      message: (error as Error).message,
      userId: req.user?.id,
      userAgent: req.headers["user-agent"],
    });
    next(error);
  }
};

export const getFeedback = async (
  req: Request<ParamsWithId>,
  res: Response<IFeedback>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный формат ID");
    }

    const feedback = await feedbackService.getFeedback({
      id,
      userId,
      userRole,
    });
    logger.info({
      message: feedback,
      userId: req.user!.id,
      feedbackId: id,
      userAgent: req.headers["user-agent"],
    });
    res.status(200).json(feedback);
  } catch (error) {
    logger.error({
      message: (error as Error).message,
      userId: req.user?.id,
      userAgent: req.headers["user-agent"],
    });
    next(error);
  }
};

export const getUserStats = async (
  req: Request,
  res: Response<UserStatsResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const stats = await feedbackService.getUserStats(userId);
    res.status(200).json(stats);
  } catch (error) {
    logger.error(`[GET_USER_STATS] ${(error as Error).message}`);
    next(error);
  }
};

// ==================== Админские маршруты ====================

export const getAllFeedbacks = async (
  req: Request<{}, GetAllFeedbacksResponse, {}, GetAllFeedbacksQuery>,
  res: Response<GetAllFeedbacksResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "20",
      type,
      status,
      priority,
      assignedTo,
      fromDate,
      toDate,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const validatedLimit = Math.min(parseInt(limit) || 20, 100);
    const validatedPage = Math.max(parseInt(page) || 1, 1);

    const filters = {
      type,
      status,
      priority,
      assignedTo,
      fromDate,
      toDate,
      search: search ? sanitizeInput(search) : undefined,
    };

    const result = await feedbackService.getAllFeedbacks({
      page: validatedPage,
      limit: validatedLimit,
      sortBy: [
        "createdAt",
        "updatedAt",
        "priority",
        "status",
        "title",
      ].includes(sortBy as string)
        ? (sortBy as string)
        : "createdAt",
      sortOrder: sortOrder === "asc" ? "asc" : "desc",
      ...filters,
    });

    logger.info({
      message: result,
      userId: req.user?.id,
      userAgent: req.headers["user-agent"],
    });
    res.set({
      "X-Total-Count": result.pagination.total,
      "X-Total-Pages": result.pagination.pages,
      "X-Current-Page": result.pagination.page,
      "X-Per-Page": result.pagination.limit,
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error({
      message: (error as Error).message,
      userId: req.user?.id,
      userAgent: req.headers["user-agent"],
    });
    next(error);
  }
};

export const updateStatus = async (
  req: Request<ParamsWithId, UpdateStatusResponse, UpdateStatusBody>,
  res: Response<UpdateStatusResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const adminId = req.user!.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный формат ID фидбека");
    }

    const result = await feedbackService.updateStatus({
      feedbackId: id,
      status,
      adminId,
      note: note ? sanitizeInput(note) : undefined,
    });

    logger.info({
      message: "Статус обновлен",
      adminId: req.user!.id,
      feedbackId: id,
      action: "update_status",
    });

    res.status(200).json({
      message: "Статус успешно обновлен",
      feedback: {
        id: result.feedback._id.toString(),
        status: result.feedback.status,
        previousStatus: result.previousStatus,
        updatedAt: result.feedback.updatedAt as Date,
      },
    });
  } catch (error) {
    logger.error({
      message: (error as Error).message,
      userId: req.user?.id,
      userAgent: req.headers["user-agent"],
    });
    next(error);
  }
};

export const updatePriority = async (
  req: Request<ParamsWithId, UpdatePriorityResponse, UpdatePriorityBody>,
  res: Response<UpdatePriorityResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    const adminId = req.user!.id;

    if (!priority) {
      throw ApiError.BadRequest("Приоритет обязателен");
    }

    const feedback = await feedbackService.updatePriority({
      feedbackId: id,
      priority,
      adminId,
    });

    res.status(200).json({
      message: "Приоритет успешно обновлен",
      feedback,
    });
  } catch (error) {
    logger.error(`[UPDATE_PRIORITY] ${(error as Error).message}`);
    next(error);
  }
};

export const addInternalNote = async (
  req: Request<ParamsWithId, AddInternalNoteResponse, AddInternalNoteBody>,
  res: Response<AddInternalNoteResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { note, isPrivate = false } = req.body;
    const adminId = req.user!.id;

    if (!note?.trim()) {
      throw ApiError.BadRequest("Текст заметки обязателен");
    }

    const feedback = await feedbackService.addInternalNote({
      feedbackId: id,
      note: note.trim(),
      adminId,
      isPrivate,
    });

    res.status(201).json({
      message: "Заметка добавлена",
      note: feedback.internalNotes[feedback.internalNotes.length - 1],
    });
  } catch (error) {
    logger.error(`[ADD_INTERNAL_NOTE] ${(error as Error).message}`);
    next(error);
  }
};

export const updateInternalNote = async (
  req: Request<ParamsWithIdAndNoteId, FeedbackResponse, UpdateInternalNoteBody>,
  res: Response<FeedbackResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, noteId } = req.params;
    const { note } = req.body;
    const adminId = req.user!.id;

    if (!note?.trim()) {
      throw ApiError.BadRequest("Текст заметки обязателен");
    }

    const feedback = await feedbackService.updateInternalNote({
      feedbackId: id,
      noteId,
      note: note.trim(),
      adminId,
    });

    res.status(200).json({
      message: "Заметка обновлена",
      feedback,
    });
  } catch (error) {
    logger.error(`[UPDATE_INTERNAL_NOTE] ${(error as Error).message}`);
    next(error);
  }
};

export const deleteInternalNote = async (
  req: Request<ParamsWithIdAndNoteId, FeedbackResponse>,
  res: Response<FeedbackResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, noteId } = req.params;
    const adminId = req.user!.id;

    const feedback = await feedbackService.deleteInternalNote({
      feedbackId: id,
      noteId,
      adminId,
    });

    res.status(200).json({
      message: "Заметка удалена",
      feedback,
    });
  } catch (error) {
    logger.error(`[DELETE_INTERNAL_NOTE] ${(error as Error).message}`);
    next(error);
  }
};

export const addTag = async (
  req: Request<ParamsWithId, AddTagResponse, AddTagBody>,
  res: Response<AddTagResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { tag } = req.body;
    const adminId = req.user!.id;

    if (!tag?.trim()) {
      throw ApiError.BadRequest("Тег обязателен");
    }

    const feedback = await feedbackService.addTag({
      feedbackId: id,
      tag: tag.trim(),
      adminId,
    });

    res.status(200).json({
      message: "Тег добавлен",
      feedback,
    });
  } catch (error) {
    logger.error(`[ADD_TAG] ${(error as Error).message}`);
    next(error);
  }
};

export const removeTag = async (
  req: Request<ParamsWithIdAndTag, FeedbackResponse>,
  res: Response<FeedbackResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, tag } = req.params;
    const adminId = req.user!.id;

    const feedback = await feedbackService.removeTag({
      feedbackId: id,
      tag,
      adminId,
    });

    res.status(200).json({
      message: "Тег удален",
      feedback,
    });
  } catch (error) {
    logger.error(`[REMOVE_TAG] ${(error as Error).message}`);
    next(error);
  }
};

export const markAsDuplicate = async (
  req: Request<ParamsWithId, FeedbackResponse, MarkAsDuplicateBody>,
  res: Response<FeedbackResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { duplicateOf, note } = req.body;
    const adminId = req.user!.id;

    if (!duplicateOf) {
      throw ApiError.BadRequest("ID оригинального фидбека обязателен");
    }

    const feedback = await feedbackService.markAsDuplicate({
      feedbackId: id,
      duplicateOfId: duplicateOf,
      adminId,
      note,
    });

    res.status(200).json({
      message: "Фидбек помечен как дубликат",
      feedback,
    });
  } catch (error) {
    logger.error(`[MARK_AS_DUPLICATE] ${(error as Error).message}`);
    next(error);
  }
};

export const deleteFeedback = async (
  req: Request<ParamsWithId, DeleteResponse>,
  res: Response<DeleteResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    await feedbackService.deleteFeedback({ feedbackId: id, adminId });

    logger.warn({
      message: "[DELETE_FEEDBACK] Фидбек удален",
      feedbackId: id,
      adminId,
    });

    res.status(200).json({
      message: "Фидбек успешно удален",
    });
  } catch (error) {
    logger.error(`[DELETE_FEEDBACK] ${(error as Error).message}`);
    next(error);
  }
};

export const getAdminStats = async (
  req: Request,
  res: Response<AdminStatsResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const stats = await feedbackService.getAdminStats();
    res.status(200).json(stats);
  } catch (error) {
    logger.error(`[GET_ADMIN_STATS] ${(error as Error).message}`);
    next(error);
  }
};

export const exportToCSV = async (
  req: Request<{}, string, {}, ExportToCSVQuery>,
  res: Response<string>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { fromDate, toDate, type, status } = req.query;

    const csvData = await feedbackService.exportToCSV({
      fromDate,
      toDate,
      type,
      status,
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=feedbacks_${Date.now()}.csv`,
    );

    res.send(csvData);
  } catch (error) {
    logger.error(`[EXPORT_TO_CSV] ${(error as Error).message}`);
    next(error);
  }
};
