import refundService from "../services/refundService.js";

const {
  addAdminNote: _addAdminNote,
  assignRefundToAdmin: _assignRefundToAdmin,
  createRefund: _createRefund,
  getAllRefunds: _getAllRefunds,
  getRefundById: _getRefundById,
  getRefundReasons: _getRefundReasons,
  getRefundStats: _getRefundStats,
  getRefundStatuses: _getRefundStatuses,
  getUserRefunds: _getUserRefunds,
  updateRefundStatus: _updateRefundStatus,
} = refundService;

const refundController = {
  // Пользовательские методы

  async createRefund(req, res, next) {
    try {
      const refundData = req.validatedData;
      const userId = req.user.id;

      const refund = await _createRefund(refundData, userId);

      res.status(201).json({
        success: true,
        message: "Заявка на возврат успешно создана",
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserRefunds(req, res, next) {
    try {
      const userId = req.user.id;
      const query = req.validatedQuery || {};

      const result = await _getUserRefunds(userId, query);

      res.json({
        success: true,
        data: result.refunds,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  async getRefundById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === "admin";

      const refund = await _getRefundById(id, userId, isAdmin);

      res.json({
        success: true,
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  },

  // Админские методы

  async getAllRefunds(req, res, next) {
    try {
      const query = req.validatedQuery || {};
      const result = await _getAllRefunds(query);

      res.json({
        success: true,
        data: result.refunds,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateRefundStatus(req, res, next) {
    try {
      const { id } = req.params;
      const statusData = req.validatedData;
      const adminId = req.user.id;
      const adminName = `${req.user.firstName} ${req.user.lastName}`;

      const refund = await _updateRefundStatus(
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
  },

  async assignRefundToAdmin(req, res, next) {
    try {
      const { id } = req.params;
      const { adminId, adminName } = req.validatedData;
      const assignerId = req.user.id;

      const refund = await _assignRefundToAdmin(
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
  },

  async addAdminNote(req, res, next) {
    try {
      const { id } = req.params;
      const noteData = req.validatedData;
      const adminId = req.user.id;
      const adminName = `${req.user.firstName} ${req.user.lastName}`;

      const refund = await _addAdminNote(id, noteData, adminId, adminName);

      res.json({
        success: true,
        message: "Заметка успешно добавлена",
        data: refund,
      });
    } catch (error) {
      next(error);
    }
  },

  async getRefundStats(req, res, next) {
    try {
      const { timeframe = "month" } = req.query;

      const stats = await _getRefundStats(timeframe);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  // Вспомогательные методы

  async getRefundReasons(req, res, next) {
    try {
      const reasons = await _getRefundReasons();

      res.json({
        success: true,
        data: reasons,
      });
    } catch (error) {
      next(error);
    }
  },

  async getRefundStatuses(req, res, next) {
    try {
      const statuses = await _getRefundStatuses();

      res.json({
        success: true,
        data: statuses,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default refundController;
