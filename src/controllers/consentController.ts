// controllers/consent.controller.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import auditLogger from "../logger/auditLogger.js";
import consentNotificationService from "../services/consentNotificationService.js";
import consentService from "../services/consentService.js";
import type { IConsent } from "../types/consent.types.js";
import type {
  ActivateConsentReq,
  ConsentResponse,
  ConsentWithNotificationStats,
  CreateConsentReq,
  DeactivateConsentReq,
  DeleteConsentReq,
  GetBySlugReq,
  GetForRegistrationReq,
  GetRequiredForAcceptanceReq,
  ListConsentsReq,
  UpdateConsentReq,
} from "../types/controllers/consent-controller.js";
import {
  createConsentSchema,
  updateConsentSchema,
} from "../validators/consent.validators.js";

/**
 * Контроллер для управления пользовательскими соглашениями.
 * Административные методы (create, update, activate, deactivate, delete) требуют авторизации.
 * Публичные методы доступны без авторизации.
 */
class ConsentController {
  /**
   * Создание нового соглашения (только администратор).
   */
  create = async (
    req: CreateConsentReq,
    res: Response<ConsentResponse<IConsent>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { error, value } = createConsentSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        throw ApiError.BadRequest(
          error.details.map((d) => d.message).join(", "),
        );
      }

      const {
        title,
        slug,
        description,
        content,
        isRequired,
        needsAcceptance,
        documentUrl,
      } = value;

      if (!title || !slug || !content) {
        throw ApiError.BadRequest(
          "Недостаточно данных для создания соглашения.",
        );
      }

      const consent = await consentService.createConsent(
        title,
        slug,
        description,
        content,
        isRequired,
        needsAcceptance,
        documentUrl,
        req.user.id,
      );

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role || "admin",
        "CONSENT_MANAGEMENT",
        "CREATE_CONSENT",
        null,
        [
          { field: "title", old: null, new: title },
          { field: "slug", old: null, new: slug },
          { field: "isRequired", old: null, new: isRequired || false },
          {
            field: "needsAcceptance",
            old: null,
            new: needsAcceptance !== false,
          },
          { field: "documentUrl", old: null, new: documentUrl || "не указан" },
          { field: "consentId", old: null, new: consent._id?.toString() || "" },
        ],
        `Создано новое соглашение: "${title}"`,
      );

      res.status(201).json({ success: true, data: consent });
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user?.id || "unknown",
        req.user?.email || "unknown@system",
        req.user?.role || "unknown",
        "CONSENT_MANAGEMENT",
        "CREATE_CONSENT_FAILED",
        null,
        [
          { field: "error", old: null, new: (error as Error).message },
          { field: "title", old: null, new: req.body?.title || "неизвестно" },
        ],
        `Ошибка при создании соглашения: ${(error as Error).message}`,
      );
      next(error);
    }
  };

  /**
   * Обновление соглашения (только администратор). Может отправлять уведомления пользователям.
   */
  update = async (
    req: UpdateConsentReq,
    res: Response<ConsentResponse<ConsentWithNotificationStats>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { error, value } = updateConsentSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        throw ApiError.BadRequest(
          error.details.map((d) => d.message).join(", "),
        );
      }

      const { slug } = req.params;
      const {
        title,
        description,
        content,
        isRequired,
        needsAcceptance,
        documentUrl,
        changeDescription,
        notifyUsers,
        notificationTypes,
      } = value;

      if (!slug) {
        throw ApiError.BadRequest("Не указан slug соглашения.");
      }

      const consent = await consentService.updateConsent(
        slug,
        {
          title,
          description,
          content,
          isRequired,
          needsAcceptance,
          documentUrl,
        },
        req.user.id,
        changeDescription || "Обновление соглашения",
      );

      let notificationStats = null;
      if (notifyUsers && notificationTypes && notificationTypes.length > 0) {
        try {
          notificationStats =
            await consentNotificationService.notifyUsersAboutConsentUpdate(
              {
                title: consent.title,
                version: consent.version,
                documentUrl: consent.documentUrl,
                changeDescription:
                  changeDescription || "Изменения в условиях соглашения",
              },
              notificationTypes,
            );
          await consentNotificationService.logNotification(
            slug,
            notificationStats,
            req.user.id,
          );
        } catch (notificationError) {
          console.error("❌ Ошибка отправки уведомлений:", notificationError);
        }
      }

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "UPDATE_CONSENT",
        {
          id: consent._id?.toString(),
          slug,
          version: consent.version,
          notifyUsers,
          notificationTypes,
          notificationStats,
        },
        [
          {
            field: "version",
            old: consent.history[consent.history.length - 2]?.version,
            new: consent.version,
          },
          { field: "notifyUsers", old: null, new: notifyUsers ? "Да" : "Нет" },
          {
            field: "notificationChannels",
            old: null,
            new: notificationTypes
              ? notificationTypes.join(", ")
              : "Не отправлялись",
          },
        ],
        `Обновлено соглашение "${slug}" до версии ${consent.version}${
          notifyUsers
            ? ` (уведомления отправлены ${notificationStats?.notified || 0} пользователям)`
            : ""
        }`,
      );

      res.json({
        success: true,
        data: {
          ...consent,
          notificationStats,
        },
      });
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "UPDATE_CONSENT_FAILED",
        null,
        [
          { field: "error", old: null, new: (error as Error).message },
          { field: "slug", old: null, new: req.params.slug },
        ],
        `Ошибка при обновлении соглашения "${req.params.slug}": ${(error as Error).message}`,
      );
      next(error);
    }
  };

  /**
   * Активация соглашения (только администратор).
   */
  activate = async (
    req: ActivateConsentReq,
    res: Response<ConsentResponse<IConsent>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { slug } = req.params;
      if (!slug) {
        throw ApiError.BadRequest("Не указан slug соглашения.");
      }

      const consent = await consentService.activateConsent(slug, req.user.id);

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "ACTIVATE_CONSENT",
        { id: consent._id?.toString(), slug },
        [{ field: "isActive", old: false, new: true }],
        `Активировано соглашение "${slug}"`,
      );

      res.json({ success: true, data: consent });
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "ACTIVATE_CONSENT_FAILED",
        null,
        [],
        `Ошибка при активации соглашения "${req.params.slug}": ${(error as Error).message}`,
      );
      next(error);
    }
  };

  /**
   * Деактивация соглашения (только администратор).
   */
  deactivate = async (
    req: DeactivateConsentReq,
    res: Response<ConsentResponse<IConsent>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { slug } = req.params;
      if (!slug) {
        throw ApiError.BadRequest("Не указан slug соглашения.");
      }

      const consent = await consentService.deactivateConsent(slug, req.user.id);

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "DEACTIVATE_CONSENT",
        { id: consent._id?.toString(), slug },
        [{ field: "isActive", old: true, new: false }],
        `Деактивировано соглашение "${slug}"`,
      );

      res.json({ success: true, data: consent });
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "DEACTIVATE_CONSENT_FAILED",
        null,
        [],
        `Ошибка при деактивации соглашения "${req.params.slug}": ${(error as Error).message}`,
      );
      next(error);
    }
  };

  /**
   * Удаление соглашения (только администратор).
   */
  delete = async (
    req: DeleteConsentReq,
    res: Response<ConsentResponse<{ message: string }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { slug } = req.params;
      if (!slug) {
        throw ApiError.BadRequest("Не указан slug соглашения.");
      }

      await consentService.deleteConsent(slug);

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "DELETE_CONSENT",
        { slug },
        [{ field: "deleted", old: "существовало", new: "удалено" }],
        `Удалено соглашение "${slug}"`,
      );

      res.json({
        success: true,
        data: { message: "Соглашение успешно удалено" },
      });
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "DELETE_CONSENT_FAILED",
        null,
        [],
        `Ошибка при удалении соглашения "${req.params.slug}": ${(error as Error).message}`,
      );
      next(error);
    }
  };

  /**
   * Получение списка соглашений для формы регистрации (публичный метод).
   */
  getForRegistration = async (
    req: GetForRegistrationReq,
    res: Response<ConsentResponse<IConsent[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const consents = await consentService.getConsentsForRegistration();
      res.json({ success: true, data: consents });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение списка соглашений, требующих принятия (публичный метод).
   */
  getRequiredForAcceptance = async (
    req: GetRequiredForAcceptanceReq,
    res: Response<ConsentResponse<IConsent[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const consents = await consentService.getConsentsRequiringAcceptance();
      res.json({ success: true, data: consents });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение списка всех соглашений (публичный метод).
   */
  list = async (
    req: ListConsentsReq,
    res: Response<ConsentResponse<IConsent[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const consents = await consentService.listConsents();
      res.json({ success: true, data: consents });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение соглашения по slug (публичный метод).
   */
  getBySlug = async (
    req: GetBySlugReq,
    res: Response<ConsentResponse<IConsent>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { slug } = req.params;
      if (!slug) {
        throw ApiError.BadRequest(
          "Недостаточно данных для получения соглашения.",
        );
      }
      const consent = await consentService.getConsentBySlug(slug);
      res.json({ success: true, data: consent });
    } catch (error) {
      next(error);
    }
  };
}

export default new ConsentController();
