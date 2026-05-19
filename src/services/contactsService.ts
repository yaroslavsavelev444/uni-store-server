// services/contact.service.ts
import type { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { ContactModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type {
  ContactDocument,
  IContact,
  IEmail,
  IOtherContact,
  IPhone,
  ISocialLink,
} from "../types/contact.types.js";

// ========== Типизация Redis ==========
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl: number): Promise<void>;
  bulkDel(keys: string[]): Promise<number>;
  ping(): Promise<string>;
  deletePattern?(pattern: string): Promise<void>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

// ========== Константы ==========
const CACHE_KEYS = {
  CONTACTS: "contacts",
  CONTACTS_ADMIN: "contacts:admin",
  CONTACTS_ACTIVE: "contacts:active",
} as const;

const CACHE_TTL = {
  PUBLIC: 300,
  ADMIN: 60,
  ACTIVE: 300,
} as const;

// Тип для данных обновления контактов
type ContactUpdateData = Partial<
  Omit<IContact, "_id" | "createdAt" | "updatedAt" | "version">
> & {
  version?: number;
};

// Тип для возвращаемых контактов (без служебных полей)
type ContactResponse = Omit<IContact, "updatedBy"> & {
  updatedBy?: { email: string; firstName: string; lastName: string };
};

// Структура по умолчанию (для админа)
export interface DefaultContactStructure {
  companyName: string;
  legalAddress: string;
  physicalAddress: string;
  phones: IPhone[];
  emails: IEmail[];
  socialLinks: ISocialLink[];
  otherContacts: IOtherContact[];
  workingHours: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  updatedBy: Types.ObjectId | null;
}

// Пустая структура для пользователей
export interface EmptyContactStructure extends Omit<
  DefaultContactStructure,
  "updatedBy"
> {
  updatedBy?: never;
}

// Health check response
interface HealthCheckResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  components?: {
    database: string;
    redis: string;
    cache: string;
  };
  error?: string;
}

class ContactService {
  async getContacts(
    isAdmin = false,
  ): Promise<
    Partial<IContact> | DefaultContactStructure | EmptyContactStructure
  > {
    try {
      let cacheKey: string;
      let cacheTtl: number;
      if (isAdmin) {
        cacheKey = CACHE_KEYS.CONTACTS_ADMIN;
        cacheTtl = CACHE_TTL.ADMIN;
      } else {
        cacheKey = CACHE_KEYS.CONTACTS_ACTIVE;
        cacheTtl = CACHE_TTL.ACTIVE;
      }

      if (process.env.CACHE_ENABLED !== "false") {
        try {
          const cached = await typedRedis.getJson<Partial<IContact>>(cacheKey);
          if (cached) {
            logger.debug(`Cache hit for ${cacheKey} (isAdmin: ${isAdmin})`);
            return cached;
          }
        } catch (cacheError) {
          logger.warn(`Cache read error for ${cacheKey}:`);
        }
      }

      const filter: Partial<Record<keyof IContact, unknown>> = {};
      if (!isAdmin) {
        filter.isActive = true;
      }

      const contacts = await ContactModel.findOne(filter).lean();

      let result:
        | Partial<IContact>
        | DefaultContactStructure
        | EmptyContactStructure;
      if (!contacts) {
        if (isAdmin) {
          result = this.getDefaultStructure();
          result.isActive = false;
        } else {
          result = this.getEmptyStructureForUsers();
        }
      } else {
        result = contacts;
      }

      if (process.env.CACHE_ENABLED !== "false") {
        try {
          await typedRedis.setJson(cacheKey, result, cacheTtl);
          logger.debug(`Cache set for ${cacheKey} (ttl: ${cacheTtl}s)`);
        } catch (cacheError) {
          logger.warn(`Cache write error for ${cacheKey}:`);
        }
      }

      return result;
    } catch (error) {
      logger.error("Error getting contacts:", error);
      throw ApiError.InternalServerError("Ошибка при получении контактов");
    }
  }

  async getContactsForAdmin(): Promise<
    Partial<IContact> | DefaultContactStructure
  > {
    return this.getContacts(true);
  }

  async updateContacts(
    data: ContactUpdateData,
    userId: string | Types.ObjectId,
  ): Promise<ContactResponse | null> {
    const session = await ContactModel.startSession();

    try {
      session.startTransaction();

      if (data.socialLinks && Array.isArray(data.socialLinks)) {
        for (const link of data.socialLinks) {
          this.validateSocialUrl(link.platform, link.url);
        }
      }

      let contacts = await ContactModel.findOne({}).session(session);

      if (contacts) {
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            (contacts as any)[key] = value;
          }
        }
        contacts.updatedBy = userId as Types.ObjectId;
        contacts.version = (contacts.version || 0) + 1;
        await contacts.save({ session });
      } else {
        contacts = new ContactModel({
          ...data,
          isActive: data.isActive !== undefined ? data.isActive : false,
          updatedBy: userId,
          version: 1,
        });
        await contacts.save({ session });
      }

      await session.commitTransaction();
      await this.invalidateAllCaches();

      const result = await ContactModel.findById(contacts._id)
        .populate<{
          updatedBy: { email: string; firstName: string; lastName: string };
        }>("updatedBy", "email firstName lastName")
        .select("-__v -_id")
        .lean();

      return result as ContactResponse | null;
    } catch (error: any) {
      await session.abortTransaction();
      logger.error("Error updating contacts:", error);

      if (error.code === 11000) {
        throw ApiError.BadRequest("Контакты уже существуют");
      }
      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map(
          (err: any) => err.message,
        );
        throw ApiError.BadRequest("Ошибка валидации", errors);
      }
      if (error.message?.includes("URL для")) {
        throw ApiError.BadRequest(error.message);
      }
      if (!(error instanceof ApiError)) {
        throw ApiError.InternalServerError("Ошибка при обновлении контактов");
      }
      throw error;
    } finally {
      session.endSession();
    }
  }

  async toggleActive(userId: string | Types.ObjectId): Promise<boolean> {
    const session = await ContactModel.startSession();

    try {
      session.startTransaction();

      const contacts = await ContactModel.findOne({}).session(session);
      if (!contacts) {
        const newContacts = new ContactModel({
          companyName: "Новая компания",
          isActive: true,
          updatedBy: userId,
          version: 1,
        });
        await newContacts.save({ session });
        await session.commitTransaction();
        await this.invalidateAllCaches();
        logger.info(`New contacts created and activated by user ${userId}`);
        return true;
      }

      contacts.isActive = !contacts.isActive;
      contacts.updatedBy = userId as Types.ObjectId;
      await contacts.save({ session });
      await session.commitTransaction();
      await this.invalidateAllCaches();

      logger.info(
        `Contacts ${contacts.isActive ? "activated" : "deactivated"} by user ${userId}`,
      );

      return contacts.isActive;
    } catch (error) {
      await session.abortTransaction();
      logger.error("Error toggling active status:", error);
      throw error instanceof ApiError
        ? error
        : ApiError.InternalServerError("Ошибка при изменении статуса");
    } finally {
      session.endSession();
    }
  }

  async getChangeHistory(
    _limit = 10,
  ): Promise<{ changes: unknown[]; total: number }> {
    try {
      return { changes: [], total: 0 };
    } catch (error) {
      logger.error("Error getting change history:", error);
      throw ApiError.InternalServerError(
        "Ошибка при получении истории изменений",
      );
    }
  }

  async exportAsVCard(isAdmin = false): Promise<string> {
    try {
      const contacts = await this.getContacts(isAdmin);
      if (!isAdmin && !contacts?.isActive) {
        return this.generateEmptyVCard();
      }
      if (!("companyName" in contacts) || !contacts.companyName) {
        throw ApiError.NotFoundError("Контакты не найдены");
      }
      return this.generateVCard(contacts as IContact);
    } catch (error) {
      logger.error("Error exporting vCard:", error);
      throw error instanceof ApiError
        ? error
        : ApiError.InternalServerError("Ошибка при экспорте контактов");
    }
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    try {
      const dbCheck = await ContactModel.findOne({}).select("_id").lean();
      const redisCheck = await typedRedis.ping();
      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        components: {
          database: dbCheck ? "connected" : "error",
          redis: redisCheck === "PONG" ? "connected" : "error",
          cache: process.env.CACHE_ENABLED || "enabled",
        },
      };
    } catch (error) {
      logger.error("Health check failed:", error);
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const keys = [
        CACHE_KEYS.CONTACTS,
        CACHE_KEYS.CONTACTS_ADMIN,
        CACHE_KEYS.CONTACTS_ACTIVE,
      ];
      await typedRedis.bulkDel(keys);
      logger.debug("All contacts caches invalidated");
    } catch (error) {
      logger.warn("Cache invalidation failed:");
    }
  }

  getDefaultStructure(): DefaultContactStructure {
    return {
      companyName: "",
      legalAddress: "",
      physicalAddress: "",
      phones: [],
      emails: [],
      socialLinks: [],
      otherContacts: [],
      workingHours: "",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      updatedBy: null,
    };
  }

  getEmptyStructureForUsers(): EmptyContactStructure {
    return {
      companyName: "",
      legalAddress: "",
      physicalAddress: "",
      phones: [],
      emails: [],
      socialLinks: [],
      otherContacts: [],
      workingHours: "",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
    };
  }

  validateSocialUrl(platform: string, url: string): boolean {
    const domainMap: Record<string, string[]> = {
      vk: ["vk.com", "vk.ru"],
      telegram: ["t.me"],
      github: ["github.com"],
      max: ["max.ru"],
    };

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error("Некорректный URL");
    }

    const hostname = parsedUrl.hostname.replace(/^www\./, "");
    const allowedDomains = domainMap[platform];
    if (!allowedDomains) {
      throw new Error(`Неизвестная платформа: ${platform}`);
    }

    const isValid = allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
    if (!isValid) {
      throw new Error(
        `URL для ${platform} должен содержать один из доменов: ${allowedDomains.join(", ")}`,
      );
    }
    return true;
  }

  generateEmptyVCard(): string {
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Контакты недоступны",
      "ORG:Контакты временно недоступны",
      "NOTE:Контакты временно недоступны. Попробуйте позже.",
      "END:VCARD",
    ].join("\n");
  }

  generateVCard(contacts: IContact): string {
    const vCard: string[] = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${contacts.companyName || "Компания"}`,
      `ORG:${contacts.companyName || "Компания"}`,
    ];

    if (contacts.phones?.length) {
      for (const phone of contacts.phones) {
        const type = phone.type === "support" ? "WORK" : "OTHER";
        vCard.push(`TEL;TYPE=${type}:${phone.value}`);
      }
    }

    if (contacts.emails?.length) {
      for (const email of contacts.emails) {
        vCard.push(`EMAIL:${email.value}`);
      }
    }

    if (contacts.physicalAddress) {
      vCard.push(`ADR:;;${contacts.physicalAddress}`);
    }
    if (contacts.workingHours) {
      vCard.push(`NOTE:Время работы: ${contacts.workingHours}`);
    }

    vCard.push("END:VCARD");
    return vCard.join("\n");
  }
}

export default new ContactService();
