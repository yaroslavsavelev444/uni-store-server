// routes/refundRoutes.ts
import { Router } from "express";
import Joi from "joi";

import refundController from "../controllers/refundController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import validationMiddleware from "../middlewares/validators.js";

// ======================= JOI SCHEMAS =======================

const refundSchemas = {
  // Создание заявки (тело запроса)
  createRefundBody: Joi.object({
    orderId: Joi.string().hex().length(24).required(),
    orderNumber: Joi.string().min(3).max(50).required(),
    userEmail: Joi.string().email().required(),
    items: Joi.array()
      .min(1)
      .items(
        Joi.object({
          productId: Joi.string().hex().length(24).required(),
          sku: Joi.string().min(1).max(100).required(),
          productName: Joi.string().min(1).max(200).required(),
          quantity: Joi.number().integer().min(1).max(1000).required(),
          pricePerUnit: Joi.number().min(0).required(),
          reason: Joi.string().required(),
          reasonDetails: Joi.string().max(500),
          isDefective: Joi.boolean(),
          defectDescription: Joi.string().max(500),
        }),
      )
      .required(),
    reason: Joi.string().required(),
    description: Joi.string().min(10).max(2000).required(),
    media: Joi.array().items(
      Joi.object({
        url: Joi.string().uri().required(),
        type: Joi.string().valid("image", "video", "document"),
        originalName: Joi.string().max(255),
        size: Joi.number().integer().min(0),
      }),
    ),
    shippingMethod: Joi.string(),
    trackingNumber: Joi.string(),
  }),

  // Обновление статуса (тело запроса)
  updateStatusBody: Joi.object({
    status: Joi.string().required(),
    reason: Joi.string().max(500),
    refundAmount: Joi.number().min(0),
    resolutionNotes: Joi.string().max(1000),
    notes: Joi.string().max(1000),
  }),

  // Назначение администратора (тело запроса)
  assignToAdminBody: Joi.object({
    adminId: Joi.string().hex().length(24).required(),
    adminName: Joi.string().min(1).max(100).required(),
  }),

  // Добавление заметки (тело запроса)
  addAdminNoteBody: Joi.object({
    note: Joi.string().min(1).max(1000).required(),
  }),

  // Query-параметры для получения списка заявок пользователя
  getUserRefundsQuery: Joi.object({
    status: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string()),
    ),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid("asc", "desc"),
  }),

  // Query-параметры для админского списка
  getAllRefundsQuery: Joi.object({
    status: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string()),
    ),
    priority: Joi.number().integer().min(1).max(5),
    assignedTo: Joi.string().hex().length(24),
    orderNumber: Joi.string(),
    userEmail: Joi.string().email(),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid("asc", "desc"),
  }),

  // Query-параметры для статистики
  getStatsQuery: Joi.object({
    timeframe: Joi.string().valid("day", "week", "month", "year"),
  }),
};

const router = Router();

// ======================= Публичные маршруты =======================
router.get("/reasons", refundController.getRefundReasons as any);
router.get("/statuses", refundController.getRefundStatuses as any);

// ======================= Защищённые маршруты =======================
router.use(authMiddleware.requireAuth());

// ----- Пользовательские -----
router.post(
  "/",
  validationMiddleware.validate(refundSchemas.createRefundBody),
  refundController.createRefund as any,
);

router.get(
  "/my",
  validationMiddleware.validateQueryParams(refundSchemas.getUserRefundsQuery),
  refundController.getUserRefunds as any,
);

router.get(
  "/my/:id",
  validationMiddleware.validateObjectId("id"),
  refundController.getRefundById as any,
);

// ----- Админские (требуют роль admin) -----
// Здесь можно добавить дополнительную проверку роли,
// например, authMiddleware.requireRole("admin"), если есть такая middleware
router.get(
  "/",
  validationMiddleware.validateQueryParams(refundSchemas.getAllRefundsQuery),
  refundController.getAllRefunds as any,
);

router.get(
  "/stats",
  validationMiddleware.validateQueryParams(refundSchemas.getStatsQuery),
  refundController.getRefundStats as any,
);

router.put(
  "/:id/status",
  validationMiddleware.validateObjectId("id"),
  validationMiddleware.validate(refundSchemas.updateStatusBody),
  refundController.updateRefundStatus as any,
);

router.put(
  "/:id/assign",
  validationMiddleware.validateObjectId("id"),
  validationMiddleware.validate(refundSchemas.assignToAdminBody),
  refundController.assignRefundToAdmin as any,
);

router.post(
  "/:id/notes",
  validationMiddleware.validateObjectId("id"),
  validationMiddleware.validate(refundSchemas.addAdminNoteBody),
  refundController.addAdminNote as any,
);

// Универсальный маршрут получения одной заявки (доступен и пользователю, и админу)
// – пользователь может видеть только свои (логика в контроллере)
router.get(
  "/:id",
  validationMiddleware.validateObjectId("id"),
  refundController.getRefundById as any,
);

export default router;
