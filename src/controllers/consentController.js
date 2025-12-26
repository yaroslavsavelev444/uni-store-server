// controllers/consent.controller.js
const ApiError = require("../exceptions/api-error");
const consentService = require("../services/consentService");
const auditLogger = require("../logger/auditLogger");

class ConsentController {
  // Создание соглашения
  async create(req, res, next) {
    try {
      const { title, slug, content, isRequired } = req.body;
      
      if(!title || !slug || !content) {
        return next(ApiError.BadRequest("Недостаточно данных для создания соглашения."));
      }
      
      const consent = await consentService.createConsent(
        title,
        slug,
        content,
        isRequired
      );
      
      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role || 'admin',
        'CONSENT_MANAGEMENT',
        'CREATE_CONSENT',
        null,
        [
          { field: 'title', old: null, new: title },
          { field: 'slug', old: null, new: slug },
          { field: 'isRequired', old: null, new: isRequired || false },
          { field: 'consentId', old: null, new: consent._id.toString() }
        ],
        `Создано новое соглашение: "${title}"`
      );
      
      res.status(201).json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user?.id || 'unknown',
        req.user?.email || 'unknown@system',
        req.user?.role || 'unknown',
        'CONSENT_MANAGEMENT',
        'CREATE_CONSENT_FAILED',
        null,
        [
          { field: 'error', old: null, new: error.message },
          { field: 'title', old: null, new: req.body?.title || 'неизвестно' }
        ],
        `Ошибка при создании соглашения: ${error.message}`
      );
      next(error);
    }
  }

  // Добавление новой версии
  async addVersion(req, res, next) {
    try {
      const { slug } = req.params;
      const { content, changeDescription } = req.body;

      if(!content || !changeDescription) {
        return next(ApiError.BadRequest("Недостаточно данных для создания версии."));
      }

      const consent = await consentService.addVersion(
        slug,
        content,
        req.user.id,
        changeDescription
      );
      
      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'ADD_VERSION',
        { id: consent._id.toString(), email: 'system@consent' },
        [
          { 
            field: 'versions', 
            old: `${consent.versions.length - 1} версий`, 
            new: `${consent.versions.length} версий` 
          }
        ],
        `Добавлена новая версия соглашения "${slug}"`
      );
      
      res.json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'ADD_VERSION_FAILED',
        null,
        [],
        `Ошибка при добавлении версии соглашения "${req.params.slug}": ${error.message}`
      );
      next(error);
    }
  }

  // Публикация версии
  async publishVersion(req, res, next) {
    try {
      const { slug, versionId } = req.params;
      
      if(!slug || !versionId) {
        return next(ApiError.BadRequest("Недостаточно данных для публикации версии."));
      }
      
      const consent = await consentService.publishVersion(slug, versionId);
      
      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'PUBLISH_VERSION',
        { id: consent._id.toString(), email: 'system@consent' },
        [
          { 
            field: 'activeVersion', 
            old: 'предыдущая', 
            new: versionId 
          }
        ],
        `Опубликована версия ${versionId} соглашения "${slug}"`
      );
      
      res.json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'PUBLISH_VERSION_FAILED',
        null,
        [],
        `Ошибка при публикации версии ${req.params.versionId} соглашения "${req.params.slug}": ${error.message}`
      );
      next(error);
    }
  }

  // Редактирование черновика
  async updateVersion(req, res, next) {
    try {
      const { slug, versionId } = req.params;
      const { content, changeDescription } = req.body;
      
      if(!content || !changeDescription) {
        return next(ApiError.BadRequest("Недостаточно данных для обновления версии."));
      }
      
      const consent = await consentService.updateDraftVersion(
        slug,
        versionId,
        content,
        req.user.id,
        changeDescription
      );
      
      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'UPDATE_VERSION',
        { id: consent._id.toString(), email: 'system@consent' },
        [
          { 
            field: 'contentUpdated', 
            old: 'предыдущая версия', 
            new: 'обновленная версия' 
          }
        ],
        `Обновлен черновик версии ${versionId} соглашения "${slug}"`
      );
      
      res.json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'UPDATE_VERSION_FAILED',
        null,
        [],
        `Ошибка при обновлении версии ${req.params.versionId} соглашения "${req.params.slug}": ${error.message}`
      );
      next(error);
    }
  }

  // Удаление версии
  async deleteVersion(req, res, next) {
    try {
      const { slug, versionId } = req.params;
      
      if(!slug || !versionId) {
        return next(ApiError.BadRequest("Недостаточно данных для удаления версии."));
      }
      
      const consent = await consentService.deleteVersion(slug, versionId);
      
      // Логирование
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'DELETE_VERSION',
        { id: consent._id.toString(), email: 'system@consent' },
        [
          { 
            field: 'deletedVersion', 
            old: versionId, 
            new: 'удалена' 
          }
        ],
        `Удалена версия ${versionId} соглашения "${slug}"`
      );
      
      res.json(consent);
    } catch (error) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONSENT_VERSION_MANAGEMENT',
        'DELETE_VERSION_FAILED',
        null,
        [],
        `Ошибка при удалении версии ${req.params.versionId} соглашения "${req.params.slug}": ${error.message}`
      );
      next(error);
    }
  }

  // Получение активной версии
  async getActive(req, res, next) {
    try {
      const { slug } = req.params;
      
      if(!slug) {
        return next(ApiError.BadRequest("Недостаточно данных для получения активной версии."));
      }
      
      const version = await consentService.getActiveVersion(slug);
      res.json(version);
    } catch (error) {
      next(error);    
    }
  }

  // Список всех соглашений
  async list(req, res, next) {
    try {
      const consents = await consentService.listConsents();
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
        return next(ApiError.BadRequest("Недостаточно данных для получения соглашения."));
      }
      
      const consent = await consentService.getConsentBySlug(slug);
      res.json(consent);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ConsentController();