// services/consentService.ts
import type { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { ConsentModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type { IConsent } from "../types/consent.types.js";

// Типизация Redis клиента
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string | string[]): Promise<number>;
  deletePattern(pattern: string): Promise<void>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

interface ConsentUpdateData {
  title?: string;
  slug?: string;
  description?: string;
  content?: string;
  documentUrl?: string;
  isRequired?: boolean;
  needsAcceptance?: boolean;
  isActive?: boolean;
}

class ConsentService {
  private readonly CACHE_TTL = 300; // 5 минут
  private readonly CACHE_KEYS = {
    CONSENTS_LIST: "consents:list",
    CONSENT_BY_SLUG: (slug: string) => `consents:${slug}`,
    REGISTRATION_CONSENTS: "consents:registration",
    REQUIRED_ACCEPTANCE: "consents:required:acceptance",
    ACTIVE_CONSENTS: "consents:active",
  };

  private async invalidateCache(slug: string | null = null): Promise<void> {
    try {
      const keysToDelete: string[] = [
        this.CACHE_KEYS.CONSENTS_LIST,
        this.CACHE_KEYS.REGISTRATION_CONSENTS,
        this.CACHE_KEYS.REQUIRED_ACCEPTANCE,
        this.CACHE_KEYS.ACTIVE_CONSENTS,
      ];
      if (slug) {
        keysToDelete.push(this.CACHE_KEYS.CONSENT_BY_SLUG(slug));
      }
      await typedRedis.del(keysToDelete);
    } catch (error) {
      console.error("Ошибка при инвалидации кеша:", error);
    }
  }

  async createConsent(
    title: string,
    slug: string,
    description: string | undefined,
    content: string,
    isRequired = true,
    needsAcceptance = true,
    documentUrl: string | null = null,
    authorId: string | Types.ObjectId,
  ): Promise<IConsent> {
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
        history: [
          {
            version: "1.0.0",
            content,
            documentUrl,
            author: authorId,
            changeDescription: "Первоначальная версия",
            createdAt: new Date(),
          },
        ],
      });

      const savedConsent = await newConsent.save();
      await this.invalidateCache();
      return savedConsent.toObject();
    } catch (error: any) {
      if (error.code === 11000) {
        throw ApiError.BadRequest(`Соглашение с slug "${slug}" уже существует`);
      }
      throw ApiError.InternalServerError(error.message);
    }
  }

  async updateConsent(
    slug: string,
    updateData: ConsentUpdateData,
    authorId: string | Types.ObjectId,
    changeDescription = "Обновление соглашения",
  ): Promise<IConsent> {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

      const originalContent = consent.content;
      const originalDocumentUrl = consent.documentUrl;
      const originalVersion = consent.version;

      for (const key of Object.keys(updateData)) {
        const value = (updateData as any)[key];
        if (value !== undefined) {
          (consent as any)[key] = value;
        }
      }

      if (
        consent.content !== originalContent ||
        consent.documentUrl !== originalDocumentUrl
      ) {
        consent.history.push({
          version: originalVersion,
          content: originalContent,
          documentUrl: originalDocumentUrl,
          author: consent.lastUpdatedBy,
          changeDescription:
            (consent as any)._changeDescription || "Предыдущая версия",
          createdAt: consent.lastUpdatedAt || new Date(),
        });

        const [major, minor, patch] = consent.version.split(".").map(Number);
        consent.version = `${major}.${minor}.${patch + 1}`;
      }

      consent.lastUpdatedBy = authorId as Types.ObjectId;
      consent.lastUpdatedAt = new Date();
      (consent as any)._changeDescription = changeDescription;

      const updatedConsent = await consent.save();
      await this.invalidateCache(slug);
      return updatedConsent.toObject();
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  async activateConsent(
    slug: string,
    authorId: string | Types.ObjectId,
  ): Promise<IConsent> {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");
      if (consent.isActive)
        throw ApiError.BadRequest("Соглашение уже активировано");

      consent.isActive = true;
      consent.lastUpdatedBy = authorId as Types.ObjectId;
      consent.lastUpdatedAt = new Date();

      const updatedConsent = await consent.save();
      await this.invalidateCache(slug);
      return updatedConsent.toObject();
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  async deactivateConsent(
    slug: string,
    authorId: string | Types.ObjectId,
  ): Promise<IConsent> {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");
      if (!consent.isActive)
        throw ApiError.BadRequest("Соглашение уже деактивировано");

      consent.isActive = false;
      consent.lastUpdatedBy = authorId as Types.ObjectId;
      consent.lastUpdatedAt = new Date();

      const updatedConsent = await consent.save();
      await this.invalidateCache(slug);
      return updatedConsent.toObject();
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  async deleteConsent(slug: string): Promise<{ success: boolean }> {
    try {
      const consent = await ConsentModel.findOne({ slug });
      if (!consent) throw ApiError.BadRequest("Соглашение не найдено");
      await ConsentModel.deleteOne({ slug });
      await this.invalidateCache(slug);
      return { success: true };
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  async getConsentsForRegistration(): Promise<any[]> {
    try {
      const cacheKey = this.CACHE_KEYS.REGISTRATION_CONSENTS;
      const cached = await typedRedis.getJson<any[]>(cacheKey);
      if (cached) return cached;

      const consents = await ConsentModel.find({
        isActive: true,
        needsAcceptance: true,
      })
        .select(
          "title slug description content documentUrl isRequired needsAcceptance version lastUpdatedAt",
        )
        .sort({ createdAt: -1 });

      const result = consents.map((c) => ({
        _id: c._id,
        title: c.title,
        slug: c.slug,
        description: c.description,
        content: c.content,
        documentUrl: c.documentUrl,
        isRequired: c.isRequired,
        needsAcceptance: c.needsAcceptance,
        version: c.version,
        updatedAt: c.lastUpdatedAt,
      }));

      await typedRedis.setJson(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  async getConsentsRequiringAcceptance(): Promise<any[]> {
    try {
      const cacheKey = this.CACHE_KEYS.REQUIRED_ACCEPTANCE;
      const cached = await typedRedis.getJson<any[]>(cacheKey);
      if (cached) return cached;

      const consents = await ConsentModel.find({
        isActive: true,
        needsAcceptance: true,
      })
        .select("title slug content isRequired version")
        .sort({ isRequired: -1, createdAt: -1 });

      const result = consents.map((c) => ({
        _id: c._id,
        title: c.title,
        slug: c.slug,
        content: c.content,
        isRequired: c.isRequired,
        version: c.version,
      }));

      await typedRedis.setJson(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  async checkAllAcceptedConsents(
    acceptedSlugs: string[],
  ): Promise<
    Array<{ title: string; slug: string; version: string; content: string }>
  > {
    try {
      const requiredConsents = await ConsentModel.find({
        isActive: true,
        isRequired: true,
        needsAcceptance: true,
      }).select("slug title");

      const requiredSlugs = requiredConsents.map((c) => c.slug);
      const missingRequired = requiredSlugs.filter(
        (s) => !acceptedSlugs.includes(s),
      );

      if (missingRequired.length > 0) {
        const missingTitles = requiredConsents
          .filter((c) => missingRequired.includes(c.slug))
          .map((c) => c.title);
        throw ApiError.BadRequest(
          `Отсутствуют обязательные согласия: ${missingTitles.join(", ")}`,
        );
      }

      const acceptedConsents = await ConsentModel.find({
        slug: { $in: acceptedSlugs },
        isActive: true,
        needsAcceptance: true,
      }).select("title slug content version");

      return acceptedConsents.map((c) => ({
        title: c.title,
        slug: c.slug,
        version: c.version,
        content: c.content,
      }));
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw ApiError.InternalServerError(error.message);
    }
  }

  async listConsents(): Promise<IConsent[]> {
    try {
      const cacheKey = this.CACHE_KEYS.CONSENTS_LIST;
      const cached = await typedRedis.getJson<IConsent[]>(cacheKey);
      if (cached) return cached;

      const consents = await ConsentModel.find()
        .select(
          "title slug description isRequired needsAcceptance isActive version documentUrl lastUpdatedAt history",
        )
        .populate("lastUpdatedBy", "email firstName lastName")
        .sort({ createdAt: -1 });

      const result = consents.map((c) => c.toObject());
      await typedRedis.setJson(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }

  async getConsentBySlug(slug: string): Promise<IConsent> {
    try {
      const cacheKey = this.CACHE_KEYS.CONSENT_BY_SLUG(slug);
      const cached = await typedRedis.getJson<IConsent>(cacheKey);
      if (cached) return cached;

      const consent = await ConsentModel.findOne({ slug })
        .populate("lastUpdatedBy", "email firstName lastName")
        .populate("history.author", "email firstName lastName");

      if (!consent) {
        throw ApiError.BadRequest("Соглашение не найдено");
      }

      const result = consent.toObject();
      await typedRedis.setJson(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      throw ApiError.InternalServerError(error.message);
    }
  }

  async getActiveConsents(): Promise<IConsent[]> {
    try {
      const cacheKey = this.CACHE_KEYS.ACTIVE_CONSENTS;
      const cached = await typedRedis.getJson<IConsent[]>(cacheKey);
      if (cached) return cached;

      const consents = await ConsentModel.find({ isActive: true })
        .select("title slug isRequired needsAcceptance version")
        .sort({ createdAt: -1 });

      const result = consents.map((c) => c.toObject());
      await typedRedis.setJson(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      throw ApiError.InternalServerError(error.message);
    }
  }
}

export default new ConsentService();
