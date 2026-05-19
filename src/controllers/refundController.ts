// controllers/refundController.ts
import type { NextFunction, Response } from "express";
import refundService from "../services/refundService.js";
import type {
  AddAdminNoteReq,
  AssignRefundToAdminReq,
  CreateRefundReq,
  GetAllRefundsReq,
  GetRefundByIdReq,
  GetRefundReasonsReq,
  GetRefundStatsReq,
  GetRefundStatusesReq,
  GetUserRefundsReq,
  UpdateRefundStatusReq,
} from "../types/controllers/refund-controller.js";

/**
 * Контроллер для управления заявками на возврат
 */
class RefundController {
  // ==================== Пользовательские методы ====================

  createRefund = async (
    req: CreateRefundReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const refundData = req.validatedData;
      const userId = req.user.id;

      const refund = await refundService.createRefund(refundData, userId);

      res.status(201).json({
        success: true,
        message: "Заявка на возврат успешно создана",
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  };

  getUserRefunds = async (
    req: GetUserRefundsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const query = req.validatedQuery || {};

      const result = await refundService.getUserRefunds(userId, query);

      res.json({
        success: true,
        data: result.refunds,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  getRefundById = async (
    req: GetRefundByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === "admin";

      const refund = await refundService.getRefundById(id, userId, isAdmin);

      res.json({
        success: true,
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== Админские методы ====================

  getAllRefunds = async (
    req: GetAllRefundsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = req.validatedQuery || {};
      const result = await refundService.getAllRefunds(query);

      res.json({
        success: true,
        data: result.refunds,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  updateRefundStatus = async (
    req: UpdateRefundStatusReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const statusData = req.validatedData;
      const adminId = req.user.id;
      const adminName = `${req.user.firstName} ${req.user.lastName}`;

      const refund = await refundService.updateRefundStatus(
        id,
        statusData,
        adminId,
        adminName,
      );

      res.json({
        success: true,
        message: "Статус заявки успешно обновлен",
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  };

  assignRefundToAdmin = async (
    req: AssignRefundToAdminReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { adminId, adminName } = req.validatedData;
      const assignerId = req.user.id;

      const refund = await refundService.assignRefundToAdmin(
        id,
        adminId,
        adminName,
        assignerId,
      );

      res.json({
        success: true,
        message: "Заявка успешно назначена",
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  };

  addAdminNote = async (
    req: AddAdminNoteReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const noteData = req.validatedData;
      const adminId = req.user.id;
      const adminName = `${req.user.firstName} ${req.user.lastName}`;

      const refund = await refundService.addAdminNote(
        id,
        noteData,
        adminId,
        adminName,
      );

      res.json({
        success: true,
        message: "Заметка успешно добавлена",
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  };

  getRefundStats = async (
    req: GetRefundStatsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { timeframe = "month" } = req.query;

      const stats = await refundService.getRefundStats(
        timeframe as "day" | "week" | "month" | "year",
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== Вспомогательные методы ====================

  getRefundReasons = async (
    req: GetRefundReasonsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const reasons = await refundService.getRefundReasons();

      res.json({
        success: true,
        data: reasons,
      });
    } catch (error) {
      next(error);
    }
  };

  getRefundStatuses = async (
    req: GetRefundStatusesReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const statuses = await refundService.getRefundStatuses();

      res.json({
        success: true,
        data: statuses,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new RefundController();
