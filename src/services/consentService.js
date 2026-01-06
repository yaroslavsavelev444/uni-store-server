// services/consent.service.js
const ApiError = require("../exceptions/api-error");
const {ConsentModel} = require("../models/index.models");
const { incrementVersion } = require("../utils/versioning");
const redisClient = require("../redis/redis.client");

class ConsentService {
  constructor() {
    this.CACHE_TTL = 300; // 5 минут для кеша
    this.CACHE_KEYS = {
      CONSENTS_LIST: 'consents:list',
      CONSENT_BY_SLUG: (slug) => `consents:${slug}`,
      ACTIVE_VERSION: (slug) => `consents:${slug}:active`,
    };
  }

  // Вспомогательный метод для инвалидации кеша
  async invalidateCache(slug = null) {
    try {
      const promises = [];
      
      // Всегда инвалидируем список соглашений
      promises.push(redisClient.del(this.CACHE_KEYS.CONSENTS_LIST));
      
      if (slug) {
        // Инвалидируем кеш конкретного соглашения
        promises.push(redisClient.del(this.CACHE_KEYS.CONSENT_BY_SLUG(slug)));
        promises.push(redisClient.del(this.CACHE_KEYS.ACTIVE_VERSION(slug)));
      }
      
      await Promise.all(promises);
    } catch (error) {
      console.error('Ошибка при инвалидации кеша:', error);
      // Продолжаем выполнение даже если кеш не очистился
    }
  }

  // Создание нового соглашения
  async createConsent(title, slug, content, isRequired = true) {
    try {
      const newConsent = new ConsentModel({
        title,
        slug,
        isRequired,
        versions: [
          {
            version: "1.0.0",
            content,
            status: "draft",
          },
        ],
      });

      const savedConsent = await newConsent.save();
      
      // Инвалидируем кеш после создания
      await this.invalidateCache();
      
      return savedConsent;
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.BadRequest(`Соглашение с slug "${slug}" уже существует`);
      }
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Добавление новой версии соглашения
  async addVersion(slug, content, authorId, changeDescription) {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      const lastVersion = consent.versions.slice(-1)[0];
      
      const newVersion = {
        version: incrementVersion(lastVersion.version, "minor"),
        content,
        status: "draft",
        changes: [
          {
            author: authorId,
            description: changeDescription || "Новая версия",
          },
        ],
      };

      consent.versions.push(newVersion);
      const updatedConsent = await consent.save();
      
      // Инвалидируем кеш этого соглашения
      await this.invalidateCache(slug);
      
      return updatedConsent;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Публикация версии соглашения
  async publishVersion(slug, versionId) {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      const version = consent.versions.id(versionId);
      if (!version) throw ApiError.BadRequest("Версия не найдена");

      if (version.status === "published") {
        throw ApiError.BadRequest("Версия уже опубликована");
      }
      
      // Деактивируем текущую опубликованную версию
      consent.versions.forEach((v) => {
        if (v.status === "published") {
          v.status = 'archived';
        }
      });

      version.status = "published";
      version.publishedAt = new Date();
      consent.currentPublished = version._id;

      const updatedConsent = await consent.save();
      
      // Инвалидируем кеш этого соглашения и активной версии
      await this.invalidateCache(slug);
      
      return updatedConsent;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Редактирование черновика версии
  async updateDraftVersion(slug, versionId, content, authorId, changeDescription, isRequired) {
  try {
    const consent = await ConsentModel.findOne({ slug });
    if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

    const version = consent.versions.id(versionId);
    if (!version) throw ApiError.BadRequest("Версия не найдена");

    if (version.status !== "draft") {
      throw ApiError.BadRequest("Можно редактировать только черновики");
    }

    // Обновить флаг isRequired соглашения если передан
    if (isRequired !== undefined) {
      consent.isRequired = isRequired;
    }

    version.content = content;
    version.changes.push({
      author: authorId,
      description: changeDescription || "Редактирование черновика",
    });

    const updatedConsent = await consent.save();
    
    // Инвалидируем кеш этого соглашения
    await this.invalidateCache(slug);
    
    return updatedConsent;
  } catch (error) {
    throw ApiError.InternalServerError(error.message);
  }
}


  // Удаление версии (только черновик)
  async deleteVersion(slug, versionId) {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      const version = consent.versions.id(versionId);
      if (!version) throw ApiError.BadRequest("Версия не найдена");

      if (version.status !== "draft") {
        throw ApiError.BadRequest("Можно удалять только черновики");
      }

      consent.versions.pull(versionId);
      const updatedConsent = await consent.save();
      
      // Инвалидируем кеш этого соглашения
      await this.invalidateCache(slug);
      
      return updatedConsent;
    } catch (error) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Получение активной версии с кешированием
  async getActiveVersion(slug) {
    try {
      const cacheKey = this.CACHE_KEYS.ACTIVE_VERSION(slug);
      
      // Пробуем получить из кеша
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consent = await ConsentModel.findOne({ slug })
        .select("title slug currentPublished versions")
        .populate("currentPublished");

      if (!consent || !consent.currentPublished) {
        throw ApiError.BadRequest("Активная версия не найдена");
      }

      const result = {
        title: consent.title,
        slug: consent.slug,
        version: consent.currentPublished.version,
        content: consent.currentPublished.content,
        publishedAt: consent.currentPublished.publishedAt,
      };
      
      // Сохраняем в кеш
      await redisClient.setJson(cacheKey, result, this.CACHE_TTL);
      
      return result;
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
      
      // Пробуем получить из кеша
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consents = await ConsentModel.find()
        .select("title slug isRequired currentPublished versions")
        .populate("currentPublished", "version publishedAt");
      
      // Сохраняем в кеш
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
      
      // Пробуем получить из кеша
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }
      
      const consent = await ConsentModel.findOne({ slug }).populate("currentPublished");
      
      if (!consent) {
        throw ApiError.BadRequest("Соглашение не найдено");
      }
      
      // Сохраняем в кеш
      await redisClient.setJson(cacheKey, consent, this.CACHE_TTL);
      
      return consent;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.InternalServerError(error.message);
    }
  }

  // Проверка всех принятых соглашений
  async checkAllAcceptedConsents(acceptedSlugs) {
    try {
      const consents = await ConsentModel.find({ slug: { $in: acceptedSlugs } })
        .select("title slug currentPublished isRequired")
        .populate("currentPublished");

      const requiredConsents = await ConsentModel.find({ isRequired: true }).select("slug");

      const missingRequired = requiredConsents
        .map(c => c.slug)
        .filter(slug => !acceptedSlugs.includes(slug));

      if (missingRequired.length > 0) {
        throw ApiError.BadRequest(`Отсутствуют обязательные согласия: ${missingRequired.join(', ')}`);
      }

      const formattedConsents = consents.map(consent => {
        if (!consent.currentPublished) {
          throw ApiError.BadRequest(`У согласия "${consent.slug}" нет опубликованной версии`);
        }

        return {
          title: consent.title,
          slug: consent.slug,
          version: consent.currentPublished.version,
          content: consent.currentPublished.content,
          publishedAt: consent.currentPublished.publishedAt
        };
      });

      return formattedConsents;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.InternalServerError(error.message);
    }
  }
}

module.exports = new ConsentService();