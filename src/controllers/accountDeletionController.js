const accountDeletionService = require("../services/accountDeletionService");
const ApiError = require("../exceptions/api-error");
const { UserModel } = require("../models/index.models");
const {
  verifyDeletion2FACode,
  resendDeletion2FACode,
  createDeletion2FACode,
  cancelDeletion2FA,
} = require("../services/2faService");

class AccountDeletionController {
  /**
   * Создание заявки на удаление аккаунта
   */
  async create(req, res, next) {
    try {
      const { reason } = req.body;
      const userId = req.user.id;
      const request = await accountDeletionService.createDeletionRequest(
        userId,
        reason,
      );

      // Отправляем 2FA сразу после создания
      const user = await UserModel.findById(userId);
      if (user)
        await createDeletion2FACode(request._id.toString(), userId, user.email);

      res.status(201).json({
        success: true,
        message: "Заявка создана. Проверьте почту для кода подтверждения.",
        requestId: request._id,
        requires2FA: true,
        expiresAt: null,
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelDeletion2FA(req, res, next) {
    try {
      const { requestId } = req.body;
      await cancelDeletion2FA(requestId, req.user.id);
      res.json({ success: true, message: "Верификация отменена" });
    } catch (err) {
      next(err);
    }
  }

  async getMyRequest(req, res, next) {
    try {
      const request = await accountDeletionService.getActiveRequest(
        req.user.id,
      );
      if (!request) {
        return res.json({ success: true, data: { hasActiveRequest: false } });
      }
      res.json({
        success: true,
        data: {
          hasActiveRequest: true,
          request: {
            id: request._id,
            status: request.status,
            reason: request.reason,
            requestedAt: request.requestedAt,
            expiresAt: request.expiresAt,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Получение всех заявок на удаление (только для админов)
   */
  async getAll(req, res, next) {
    try {
      const requests = await accountDeletionService.getAllRequests();
      res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyDeletion2FA(req, res, next) {
    try {
      const { requestId, verificationCode } = req.body;
      const result = await verifyDeletion2FACode(
        requestId,
        verificationCode,
        req.ip,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async resendDeletion2FA(req, res, next) {
    try {
      const { requestId } = req.body;
      await resendDeletion2FACode(requestId);
      res.json({ success: true, message: "Код отправлен повторно" });
    } catch (err) {
      next(err);
    }
  }
  /**
   * Отмена активной заявки на удаление
   */
  async cancel(req, res, next) {
    try {
      const userId = req.user.id;
      const request = await accountDeletionService.cancelRequest(userId);
      res.status(200).json({
        success: true,
        message: "Заявка на удаление аккаунта отменена",
        data: request,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AccountDeletionController();
