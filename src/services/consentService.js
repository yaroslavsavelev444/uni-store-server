const ApiError = require("../exceptions/api-error");
const {ConsentModel} = require("../models/index.models");
const redisClient = require("../redis/redis.client");

class ConsentService {
  constructor() {
    this.CACHE_TTL = 300; // 5 минут для кеша
    this.CACHE_KEYS = {
      CONSENTS_LIST: 'consents:list',
      CONSENT_BY_SLUG: (slug) => `consents:${slug}`,
      REGISTRATION_CONSENTS: 'consents:registration',
      REQUIRED_ACCEPTANCE: 'consents:required:acceptance',
      ACTIVE_CONSENTS: 'consents:active'
    };
  }

  // Вспомогательный метод для инвалидации кеша
  async invalidateCache(slug = null) {
    try {
      const promises = [];
      
      promises.push(redisClient.del(this.CACHE_KEYS.CONSENTS_LIST));
      promises.push(redisClient.del(this.CACHE_KEYS.REGISTRATION_CONSENTS));
      promises.push(redisClient.del(this.CACHE_KEYS.REQUIRED_ACCEPTANCE));
      promises.push(redisClient.del(this.CACHE_KEYS.ACTIVE_CONSENTS));
      
      if (slug) {
        promises.push(redisClient.del(this.CACHE_KEYS.CONSENT_BY_SLUG(slug)));
      }
      
      await Promise.all(promises);
    } catch (error) {
      console.error('Ошибка при инвалидации кеша:', error);
    }
  }

  // Создание нового соглашения
  async createConsent(title, slug, description, content, isRequired = true, needsAcceptance = true, documentUrl = null, authorId) {
    try {
      const newConsent = new ConsentModel({
        title,
        slug,
        description,
        content,
        isRequired: isRequired !== false,
        needsAcceptance: needsAcceptance !== false,
        documentUrl,
        version: "1.0.0",
        isActive: true,
        lastUpdatedBy: authorId,
        history: [{
          version: "1.0.0",
          content,
          documentUrl,
          author: authorId,
          changeDescription: "Первоначальная версия",
          createdAt: new Date()
        }]
      });

      const savedConsent = await newConsent.save();
      
      await this.invalidateCache();
      
      return savedConsent;
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.BadRequest(`Соглашение с slug "${slug}" уже существует`);
      }
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Обновление соглашения
  async updateConsent(slug, updateData, authorId, changeDescription = "Обновление соглашения") {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      // Сохраняем текущие значения перед обновлением
      const originalContent = consent.content;
      const originalDocumentUrl = consent.documentUrl;
      const originalVersion = consent.version;

      // Обновляем данные соглашения
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          consent[key] = updateData[key];
        }
      });

      // Сохраняем историю вручную, чтобы middleware сработал правильно
      if (consent.content !== originalContent || consent.documentUrl !== originalDocumentUrl) {
        consent.history.push({
          version: originalVersion,
          content: originalContent,
          documentUrl: originalDocumentUrl,
          author: consent.lastUpdatedBy,
          changeDescription: consent._changeDescription || "Предыдущая версия",
          createdAt: consent.lastUpdatedAt || new Date()
        });

        // Увеличиваем версию
        const [major, minor, patch] = consent.version.split('.').map(Number);
        consent.version = `${major}.${minor}.${patch + 1}`;
      }

      // Обновляем информацию об авторе изменения
      consent.lastUpdatedBy = authorId;
      consent.lastUpdatedAt = new Date();
      
      // Сохраняем описание изменения для истории
      consent._changeDescription = changeDescription;

      const updatedConsent = await consent.save();
      
      await this.invalidateCache(slug);
      
      return updatedConsent;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Активация соглашения
  async activateConsent(slug, authorId) {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      if (consent.isActive) {
        throw ApiError.BadRequest("Соглашение уже активировано");
      }

      consent.isActive = true;
      consent.lastUpdatedBy = authorId;
      consent.lastUpdatedAt = new Date();

      const updatedConsent = await consent.save();
      
      await this.invalidateCache(slug);
      
      return updatedConsent;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Деактивация соглашения
  async deactivateConsent(slug, authorId) {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      if (!consent.isActive) {
        throw ApiError.BadRequest("Соглашение уже деактивировано");
      }

      consent.isActive = false;
      consent.lastUpdatedBy = authorId;
      consent.lastUpdatedAt = new Date();

      const updatedConsent = await consent.save();
      
      await this.invalidateCache(slug);
      
      return updatedConsent;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Удаление соглашения
  async deleteConsent(slug) {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      await ConsentModel.deleteOne({ slug });
      
      await this.invalidateCache(slug);
      
      return { success: true };
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Получение соглашений для отображения при регистрации
  async getConsentsForRegistration() {
    try {
      const cacheKey = this.CACHE_KEYS.REGISTRATION_CONSENTS;
      
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consents = await ConsentModel.find({ 
        isActive: true , needsAcceptance: true
      })
        .select("title slug description content documentUrl isRequired needsAcceptance version lastUpdatedAt")
        .sort({ createdAt: -1 });
      
      const result = consents.map(consent => ({
        _id: consent._id,
        title: consent.title,
        slug: consent.slug,
        description: consent.description,
        content: consent.content,
        documentUrl: consent.documentUrl,
        isRequired: consent.isRequired,
        needsAcceptance: consent.needsAcceptance,
        version: consent.version,
        updatedAt: consent.lastUpdatedAt
      }));
      
      await redisClient.setJson(cacheKey, result, this.CACHE_TTL);
      
      return result;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Получение соглашений, которые требуют принятия (для акцептов)
  async getConsentsRequiringAcceptance() {
    try {
      const cacheKey = this.CACHE_KEYS.REQUIRED_ACCEPTANCE;
      
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consents = await ConsentModel.find({ 
        isActive: true,
        needsAcceptance: true 
      })
        .select("title slug content isRequired version")
        .sort({ isRequired: -1, createdAt: -1 });
      
      const result = consents.map(consent => ({
        _id: consent._id,
        title: consent.title,
        slug: consent.slug,
        content: consent.content,
        isRequired: consent.isRequired,
        version: consent.version
      }));
      
      await redisClient.setJson(cacheKey, result, this.CACHE_TTL);
      
      return result;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Проверка всех принятых соглашений
  async checkAllAcceptedConsents(acceptedSlugs) {
    try {
      const requiredConsents = await ConsentModel.find({ 
        isActive: true,
        isRequired: true,
        needsAcceptance: true 
      }).select("slug title");

      const missingRequired = requiredConsents
        .map(c => c.slug)
        .filter(slug => !acceptedSlugs.includes(slug));

      if (missingRequired.length > 0) {
        const missingTitles = requiredConsents
          .filter(c => missingRequired.includes(c.slug))
          .map(c => c.title);
          
        throw ApiError.BadRequest(`Отсутствуют обязательные согласия: ${missingTitles.join(', ')}`);
      }

      // Получаем только те соглашения, которые требуют принятия
      const acceptedConsents = await ConsentModel.find({ 
        slug: { $in: acceptedSlugs },
        isActive: true,
        needsAcceptance: true 
      })
        .select("title slug content version");

      const formattedConsents = acceptedConsents.map(consent => ({
        title: consent.title,
        slug: consent.slug,
        version: consent.version,
        content: consent.content
      }));

      return formattedConsents;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Получение всех соглашений с кешированием
  async listConsents() {
    try {
      const cacheKey = this.CACHE_KEYS.CONSENTS_LIST;
      
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consents = await ConsentModel.find()
        .select("title slug description isRequired needsAcceptance isActive version documentUrl lastUpdatedAt history")
        .populate("lastUpdatedBy", "email firstName lastName")
        .sort({ createdAt: -1 });
      
      await redisClient.setJson(cacheKey, consents, this.CACHE_TTL);
      
      return consents;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Получение конкретного соглашения по slug с кешированием
  async getConsentBySlug(slug) {
    try {
      const cacheKey = this.CACHE_KEYS.CONSENT_BY_SLUG(slug);
      
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consent = await ConsentModel.findOne({ slug })
        .populate("lastUpdatedBy", "email firstName lastName")
        .populate("history.author", "email firstName lastName");
      
      if (!consent) {
        throw ApiError.BadRequest("Соглашение не найдено");
      }
      
      await redisClient.setJson(cacheKey, consent, this.CACHE_TTL);
      
      return consent;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Получение активных соглашений
  async getActiveConsents() {
    try {
      const cacheKey = this.CACHE_KEYS.ACTIVE_CONSENTS;
      
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consents = await ConsentModel.find({ isActive: true })
        .select("title slug isRequired needsAcceptance version")
        .sort({ createdAt: -1 });
      
      await redisClient.setJson(cacheKey, consents, this.CACHE_TTL);
      
      return consents;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }
}

module.exports = new ConsentService();