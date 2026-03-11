import ApiError from "../exceptions/api-error.js";
import auditLogger from "../logger/auditLogger.js";
import consentNotificationService from "../services/consentNotificationService.js";

const { logNotification, notifyUsersAboutConsentUpdate } =
  consentNotificationService;

import consentService from "../services/consentService.js";

const {
  activateConsent,
  createConsent,
  deactivateConsent,
  deleteConsent,
  getConsentBySlug,
  getConsentsForRegistration,
  getConsentsRequiringAcceptance,
  listConsents,
  updateConsent,
} = consentService;

import consentValidators from "../validators/consent.validators.js";

const { createConsentSchema, updateConsentSchema } = consentValidators;

class ConsentController {
  async create(req, res, next) {
    try {
      const { error, value } = createConsentSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        return next(
          ApiError.BadRequest(error.details.map((d) => d.message).join(", ")),
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
      } = req.body;

      if (!title || !slug || !content) {
        return next(
          ApiError.BadRequest("Недостаточно данных для создания соглашения."),
        );
      }

      const consent = await createConsent(
        title,
        slug,
        description,
        content,
        isRequired,
        needsAcceptance,
        documentUrl,
        req.user.id,
      );

      // Логирование
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
          { field: "consentId", old: null, new: consent._id.toString() },
        ],
        `Создано новое соглашение: "${title}"`,
      );

      res.status(201).json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user?.id || "unknown",
        req.user?.email || "unknown@system",
        req.user?.role || "unknown",
        "CONSENT_MANAGEMENT",
        "CREATE_CONSENT_FAILED",
        null,
        [
          { field: "error", old: null, new: error.message },
          { field: "title", old: null, new: req.body?.title || "неизвестно" },
        ],
        `Ошибка при создании соглашения: ${error.message}`,
      );
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updateConsentSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        return next(
          ApiError.BadRequest(error.details.map((d) => d.message).join(", ")),
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
      } = value; // Используем validated value

      if (!slug) {
        return next(ApiError.BadRequest("Не указан slug соглашения."));
      }

      const consent = await updateConsent(
        slug,
        {
          title,
          description,
          content,
          isRequired,
          needsAcceptance,
          documentUrl,
          notifyUsers,
          notificationTypes,
        },
        req.user.id,
        changeDescription || "Обновление соглашения",
      );

      // Отправляем уведомления, если выбран чекбокс
      let notificationStats = null;
      if (notifyUsers && notificationTypes && notificationTypes.length > 0) {
        try {
          notificationStats = await notifyUsersAboutConsentUpdate(
            {
              title: consent.title,
              version: consent.version,
              documentUrl: consent.documentUrl,
              changeDescription:
                changeDescription || "Изменения в условиях соглашения",
            },
            notificationTypes,
          );

          // Логируем статистику отправки
          await logNotification(slug, notificationStats, req.user.id);

          console.log(
            `📨 Уведомления отправлены: ${notificationStats.notified}/${notificationStats.totalUsers} пользователей`,
          );
        } catch (notificationError) {
          console.error("❌ Ошибка отправки уведомлений:", notificationError);
        }
      }

      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "UPDATE_CONSENT",
        {
          id: consent._id.toString(),
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
          {
            field: "notifyUsers",
            old: null,
            new: notifyUsers ? "Да" : "Нет",
          },
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
        ...consent.toObject(),
        notificationStats,
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
          { field: "error", old: null, new: error.message },
          { field: "slug", old: null, new: req.params.slug },
        ],
        `Ошибка при обновлении соглашения "${req.params.slug}": ${error.message}`,
      );
      next(error);
    }
  }

  // Активация соглашения
  async activate(req, res, next) {
    try {
      const { slug } = req.params;

      if (!slug) {
        return next(ApiError.BadRequest("Не указан slug соглашения."));
      }

      const consent = await activateConsent(slug, req.user.id);

      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "ACTIVATE_CONSENT",
        { id: consent._id.toString(), slug },
        [{ field: "isActive", old: false, new: true }],
        `Активировано соглашение "${slug}"`,
      );

      res.json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "ACTIVATE_CONSENT_FAILED",
        null,
        [],
        `Ошибка при активации соглашения "${req.params.slug}": ${error.message}`,
      );
      next(error);
    }
  }

  // Деактивация соглашения
  async deactivate(req, res, next) {
    try {
      const { slug } = req.params;

      if (!slug) {
        return next(ApiError.BadRequest("Не указан slug соглашения."));
      }

      const consent = await deactivateConsent(slug, req.user.id);

      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "DEACTIVATE_CONSENT",
        { id: consent._id.toString(), slug },
        [{ field: "isActive", old: true, new: false }],
        `Деактивировано соглашение "${slug}"`,
      );

      res.json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "DEACTIVATE_CONSENT_FAILED",
        null,
        [],
        `Ошибка при деактивации соглашения "${req.params.slug}": ${error.message}`,
      );
      next(error);
    }
  }

  // Удаление соглашения
  async delete(req, res, next) {
    try {
      const { slug } = req.params;

      if (!slug) {
        return next(ApiError.BadRequest("Не указан slug соглашения."));
      }

      await deleteConsent(slug);

      // Логирование
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

      res.json({ message: "Соглашение успешно удалено" });
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONSENT_MANAGEMENT",
        "DELETE_CONSENT_FAILED",
        null,
        [],
        `Ошибка при удалении соглашения "${req.params.slug}": ${error.message}`,
      );
      next(error);
    }
  }

  // Получение соглашений для регистрации
  async getForRegistration(req, res, next) {
    try {
      const consents = await getConsentsForRegistration();
      console.log("getforregister", consents);

      res.json(consents);
    } catch (error) {
      next(error);
    }
  }

  // Получение соглашений требующих принятия
  async getRequiredForAcceptance(req, res, next) {
    try {
      const consents = await getConsentsRequiringAcceptance();
      res.json(consents);
    } catch (error) {
      next(error);
    }
  }

  // Список всех соглашений
  async list(req, res, next) {
    try {
      const consents = await listConsents();
      res.json(consents);
    } catch (error) {
      next(error);
    }
  }

  // Получение соглашения по slug
  async getBySlug(req, res, next) {
    try {
      const { slug } = req.params;

      if (!slug) {
        return next(
          ApiError.BadRequest("Недостаточно данных для получения соглашения."),
        );
      }

      const consent = await getConsentBySlug(slug);
      res.json(consent);
    } catch (error) {
      next(error);
    }
  }
}

export default new ConsentController();
