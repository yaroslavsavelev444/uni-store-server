// controllers/feedbackController.js
const feedbackService = require("../services/feedbackService");
const logger = require("../logger/logger");
const ApiError = require("../exceptions/api-error");
const { default: mongoose } = require("mongoose");
const sanitize = require("sanitize-filename");


const sanitizeInput = (data) => {
  if (typeof data === 'string') {
    return sanitize(data.trim());
  }
  return data;
};

const submitFeedback = async (req, res, next) => {
  try {
    // Дополнительная валидация
    if (!req.body.title || !req.body.description || !req.body.type) {
      throw ApiError.BadRequest("Заголовок, описание и тип обязательны");
    }

    // Лимит вложений
    if (req.body.attachments && req.body.attachments.length > 5) {
      throw ApiError.BadRequest("Максимум 5 вложений");
    }

    const feedbackData = {
      title: sanitizeInput(req.body.title),
      description: sanitizeInput(req.body.description),
      type: req.body.type,
      attachments: req.body.attachments || [],
      userId: req.user.id,
      userEmail: req.user.email ? sanitizeInput(req.user.email.toLowerCase()) : "",
      userName: req.user.name ? sanitizeInput(req.user.name) : "",
      userRole: req.user.role || "user",
      deviceInfo: {
        userAgent: req.headers['user-agent'] || '',
        platform: req.useragent?.platform || '',
        os: req.useragent?.os || '',
        browser: req.useragent?.browser || '',
        screenResolution: req.headers['sec-ch-ua-resolution'] || ''
      },
      ipAddress: req.ip
    };

    const feedback = await feedbackService.submitFeedback(feedbackData);
    
    logger.info("Новый фидбек создан", {
      userId: req.user.id,
      feedbackId: feedback._id,
      type: feedback.type,
      ip: req.ip
    });

    return res.status(201).json({
      message: "Спасибо за обратную связь! Мы получили ваше сообщение.",
      feedbackId: feedback._id,
      status: feedback.status,
      priority: feedback.priority
    });
  } catch (error) {
    logger.error(`[SUBMIT_FEEDBACK] ${error.message}`, {
      userId: req.user?.id,
      ip: req.ip,
      error: error.stack
    });
    next(error);
  }
};


const getFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Валидация ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный формат ID");
    }
    
    const feedback = await feedbackService.getFeedback(id, userId, userRole);
    
    return res.status(200).json(feedback);
  } catch (error) {
    logger.error(`[GET_FEEDBACK] ${error.message}`, {
      userId: req.user?.id,
      feedbackId: req.params.id,
      userAgent: req.headers['user-agent']
    });
    next(error);
  }
};


const getAllFeedbacks = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      type, 
      status, 
      priority, 
      assignedTo,
      fromDate,
      toDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Валидация лимита
    const validatedLimit = Math.min(parseInt(limit) || 20, 100);
    const validatedPage = Math.max(parseInt(page) || 1, 1);
    
    const filters = {
      type,
      status,
      priority,
      assignedTo,
      fromDate,
      toDate,
      search: search ? sanitizeInput(search) : undefined
    };
    
    const result = await feedbackService.getAllFeedbacks({
      page: validatedPage,
      limit: validatedLimit,
      sortBy: ['createdAt', 'updatedAt', 'priority', 'status', 'title'].includes(sortBy) 
        ? sortBy 
        : 'createdAt',
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
      ...filters
    });

    // Добавляем заголовки пагинации
    res.set({
      'X-Total-Count': result.pagination.total,
      'X-Total-Pages': result.pagination.pages,
      'X-Current-Page': result.pagination.page,
      'X-Per-Page': result.pagination.limit
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error(`[GET_ALL_FEEDBACKS] ${error.message}`, {
      adminId: req.user?.id,
      query: req.query
    });
    next(error);
  }
};



const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const adminId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный формат ID фидбека");
    }

    const feedback = await feedbackService.updateStatus(
      id, 
      status, 
      adminId, 
      note ? sanitizeInput(note) : undefined
    );
    
    logger.info("Статус фидбека обновлен", {
      adminId,
      feedbackId: id,
      oldStatus: feedback.previousStatus,
      newStatus: status
    });

    return res.status(200).json({
      message: "Статус успешно обновлен",
      feedback: {
        id: feedback._id,
        status: feedback.status,
        previousStatus: feedback.previousStatus,
        updatedAt: feedback.updatedAt
      }
    });
  } catch (error) {
    logger.error(`[UPDATE_STATUS] ${error.message}`, {
      adminId: req.user?.id,
      feedbackId: req.params.id,
      action: 'update_status'
    });
    next(error);
  }
};


const updatePriority = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    const adminId = req.user.id;
    
    if (!priority) {
      throw ApiError.BadRequest("Приоритет обязателен");
    }

    const feedback = await feedbackService.updatePriority(id, priority, adminId);
    
    return res.status(200).json({
      message: "Приоритет успешно обновлен",
      feedback
    });
  } catch (error) {
    logger.error(`[UPDATE_PRIORITY] ${error.message}`);
    next(error);
  }
};


const addInternalNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note, isPrivate = false } = req.body;
    const adminId = req.user.id;
    
    if (!note?.trim()) {
      throw ApiError.BadRequest("Текст заметки обязателен");
    }

    const feedback = await feedbackService.addInternalNote(id, note, adminId, isPrivate);
    
    return res.status(201).json({
      message: "Заметка добавлена",
      note: feedback.internalNotes[feedback.internalNotes.length - 1]
    });
  } catch (error) {
    logger.error(`[ADD_INTERNAL_NOTE] ${error.message}`);
    next(error);
  }
};

const updateInternalNote = async (req, res, next) => {
  try {
    const { id, noteId } = req.params;
    const { note } = req.body;
    const adminId = req.user.id;
    
    if (!note?.trim()) {
      throw ApiError.BadRequest("Текст заметки обязателен");
    }

    const feedback = await feedbackService.updateInternalNote(id, noteId, note, adminId);
    
    return res.status(200).json({
      message: "Заметка обновлена",
      feedback
    });
  } catch (error) {
    logger.error(`[UPDATE_INTERNAL_NOTE] ${error.message}`);
    next(error);
  }
};

const deleteInternalNote = async (req, res, next) => {
  try {
    const { id, noteId } = req.params;
    const adminId = req.user.id;
    
    const feedback = await feedbackService.deleteInternalNote(id, noteId, adminId);
    
    return res.status(200).json({
      message: "Заметка удалена",
      feedback
    });
  } catch (error) {
    logger.error(`[DELETE_INTERNAL_NOTE] ${error.message}`);
    next(error);
  }
};

const addTag = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;
    const adminId = req.user.id;
    
    if (!tag?.trim()) {
      throw ApiError.BadRequest("Тег обязателен");
    }

    const feedback = await feedbackService.addTag(id, tag.trim(), adminId);
    
    return res.status(200).json({
      message: "Тег добавлен",
      feedback
    });
  } catch (error) {
    logger.error(`[ADD_TAG] ${error.message}`);
    next(error);
  }
};

const removeTag = async (req, res, next) => {
  try {
    const { id, tag } = req.params;
    const adminId = req.user.id;
    
    const feedback = await feedbackService.removeTag(id, tag, adminId);
    
    return res.status(200).json({
      message: "Тег удален",
      feedback
    });
  } catch (error) {
    logger.error(`[REMOVE_TAG] ${error.message}`);
    next(error);
  }
};


const markAsDuplicate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { duplicateOf, note } = req.body;
    const adminId = req.user.id;
    
    if (!duplicateOf) {
      throw ApiError.BadRequest("ID оригинального фидбека обязателен");
    }

    const feedback = await feedbackService.markAsDuplicate(id, duplicateOf, adminId, note);
    
    return res.status(200).json({
      message: "Фидбек помечен как дубликат",
      feedback
    });
  } catch (error) {
    logger.error(`[MARK_AS_DUPLICATE] ${error.message}`);
    next(error);
  }
};

const deleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    await feedbackService.deleteFeedback(id, adminId);
    
    logger.warn("Фидбек удален администратором", {
      adminId,
      feedbackId: id
    });

    return res.status(200).json({
      message: "Фидбек успешно удален"
    });
  } catch (error) {
    logger.error(`[DELETE_FEEDBACK] ${error.message}`);
    next(error);
  }
};

const getAdminStats = async (req, res, next) => {
  try {
    const stats = await feedbackService.getAdminStats();
    return res.status(200).json(stats);
  } catch (error) {
    logger.error(`[GET_ADMIN_STATS] ${error.message}`);
    next(error);
  }
};

const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const stats = await feedbackService.getUserStats(userId);
    return res.status(200).json(stats);
  } catch (error) {
    logger.error(`[GET_USER_STATS] ${error.message}`);
    next(error);
  }
};

const exportToCSV = async (req, res, next) => {
  try {
    const { fromDate, toDate, type, status } = req.query;
    
    const csvData = await feedbackService.exportToCSV({
      fromDate,
      toDate,
      type,
      status
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=feedbacks_${Date.now()}.csv`);
    
    return res.send(csvData);
  } catch (error) {
    logger.error(`[EXPORT_TO_CSV] ${error.message}`);
    next(error);
  }
};

module.exports = {
  submitFeedback,
  getFeedback,
  getAllFeedbacks,
  updateStatus,
  updatePriority,
  addInternalNote,
  updateInternalNote,
  deleteInternalNote,
  addTag,
  removeTag,
  markAsDuplicate,
  deleteFeedback,
  getAdminStats,
  getUserStats,
  exportToCSV
};