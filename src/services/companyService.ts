// services/companyService.ts
import mongoose, { type Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { CompanyModel, OrderModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type { ICompany } from "../types/company.types.js";

// Типизация Redis клиента с кастомными методами
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string | string[]): Promise<number>;
  deletePattern(pattern: string): Promise<void>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

interface CompanyForSelection {
  _id: Types.ObjectId;
  companyName: string;
  taxNumber: string;
  companyAddress?: string;
  contactPerson?: string;
  orderCount: number;
  lastUsed: Date | null;
}

export interface SearchCompanyResult extends Omit<ICompany, "user" | "__v"> {
  _id: Types.ObjectId;
}

class CompanyService {
  private readonly cachePrefix = "company:";
  private readonly cacheTTL = 3600; // 1 час

  async checkCompanyOwnership(
    userId: string | Types.ObjectId,
    companyId: string | Types.ObjectId,
  ): Promise<boolean> {
    try {
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      })
        .select("_id")
        .lean();
      return !!company;
    } catch (error) {
      logger.error(
        `[CompanyService] Ошибка проверки принадлежности компании ${companyId}:`,
        error,
      );
      throw ApiError.DatabaseError("Ошибка при проверке компании");
    }
  }

  async validateCompanyForOrder(
    userId: string | Types.ObjectId,
    companyId: string | Types.ObjectId,
  ): Promise<ICompany> {
    try {
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      })
        .select(
          "companyName companyAddress taxNumber legalAddress contactPerson",
        )
        .lean();
      if (!company) {
        throw ApiError.NotFoundError(
          "Компания не найдена или у вас нет к ней доступа",
        );
      }
      const requiredFields = [
        "companyName",
        "companyAddress",
        "taxNumber",
      ] as const;
      const missingFields = requiredFields.filter(
        (field) => !company[field] || (company[field] as string).trim() === "",
      );
      if (missingFields.length) {
        throw ApiError.BadRequest(
          `У компании не заполнены обязательные поля: ${missingFields.join(", ")}`,
        );
      }
      return company as ICompany;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(
        `[CompanyService] Ошибка валидации компании ${companyId}:`,
        error,
      );
      throw ApiError.DatabaseError("Ошибка при проверке компании");
    }
  }

  async getCompaniesForSelection(
    userId: string | Types.ObjectId,
  ): Promise<CompanyForSelection[]> {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:selection`;
      const cached = await typedRedis.getJson<CompanyForSelection[]>(cacheKey);
      if (cached) return cached;

      const companies = await CompanyModel.find({ user: userId })
        .select("companyName taxNumber companyAddress contactPerson")
        .sort({ companyName: 1 })
        .lean();

      const companiesWithOrderCount = await Promise.all(
        companies.map(async (company) => {
          const orderCount = await OrderModel.countDocuments({
            "companyInfo.companyId": company._id,
            status: { $nin: ["cancelled", "refunded"] },
          });
          return {
            ...company,
            orderCount,
            lastUsed: null,
          };
        }),
      );

      await typedRedis.setJson(cacheKey, companiesWithOrderCount, 1800);
      return companiesWithOrderCount;
    } catch (error) {
      logger.error(
        "[CompanyService] Ошибка получения компаний для выбора:",
        error,
      );
      throw ApiError.DatabaseError("Ошибка при получении списка компаний");
    }
  }

  async createCompany(
    userId: string | Types.ObjectId,
    companyData: Partial<ICompany>,
  ): Promise<ICompany> {
    try {
      const cleanedTaxNumber = (companyData.taxNumber ?? "").replace(/\s/g, "");
      const existingCompany = await CompanyModel.findOne({
        user: userId,
        taxNumber: cleanedTaxNumber,
      });
      if (existingCompany) {
        throw ApiError.BadRequest("Компания с таким ИНН уже существует");
      }

      const company = await CompanyModel.create({
        ...companyData,
        user: userId,
        taxNumber: cleanedTaxNumber,
      });
      await this.invalidateUserCompaniesCache(userId);
      logger.info(
        `[CompanyService] Создана компания ${company._id} для пользователя ${userId}`,
      );
      return company.toObject();
    } catch (error: any) {
      if (error.code === 11000) {
        throw ApiError.BadRequest("Компания с таким ИНН уже существует");
      }
      throw error;
    }
  }

  async getUserCompanies(userId: string | Types.ObjectId): Promise<ICompany[]> {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:all`;
      const cached = await typedRedis.getJson<ICompany[]>(cacheKey);
      if (cached) {
        logger.debug(
          `[CompanyService] Получены компании пользователя ${userId} из кеша`,
        );
        return cached;
      }

      const companies = await CompanyModel.find({ user: userId })
        .select("-__v")
        .sort({ createdAt: -1 })
        .lean();
      await typedRedis.setJson(cacheKey, companies, this.cacheTTL);
      logger.debug(
        `[CompanyService] Получены компании пользователя ${userId} из БД`,
      );
      return companies as ICompany[];
    } catch (error) {
      logger.error(
        `[CompanyService] Ошибка получения компаний пользователя ${userId}:`,
        error,
      );
      throw ApiError.DatabaseError("Ошибка при получении списка компаний");
    }
  }

  async getCompanyById(
    userId: string | Types.ObjectId,
    companyId: string | Types.ObjectId,
  ): Promise<ICompany> {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:${companyId}`;
      const cached = await typedRedis.getJson<ICompany>(cacheKey);
      if (cached) {
        logger.debug(`[CompanyService] Получена компания ${companyId} из кеша`);
        return cached;
      }

      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      })
        .select("-__v")
        .lean();
      if (!company) throw ApiError.NotFoundError("Компания не найдена");
      await typedRedis.setJson(cacheKey, company, this.cacheTTL);
      return company as ICompany;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(
        `[CompanyService] Ошибка получения компании ${companyId}:`,
        error,
      );
      throw ApiError.DatabaseError("Ошибка при получении компании");
    }
  }

  async getCompanyByTaxNumber(
    userId: string | Types.ObjectId,
    taxNumber: string,
  ): Promise<ICompany> {
    try {
      const cleanedTaxNumber = taxNumber.replace(/\s/g, "");
      const cacheKey = `${this.cachePrefix}user:${userId}:tax:${cleanedTaxNumber}`;
      const cached = await typedRedis.getJson<ICompany>(cacheKey);
      if (cached) {
        logger.debug(
          `[CompanyService] Получена компания по ИНН ${cleanedTaxNumber} из кеша`,
        );
        return cached;
      }

      const company = await CompanyModel.findOne({
        user: userId,
        taxNumber: cleanedTaxNumber,
      })
        .select("-__v")
        .lean();
      if (!company) throw ApiError.NotFoundError("Компания не найдена");
      await typedRedis.setJson(cacheKey, company, this.cacheTTL);
      return company as ICompany;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(
        `[CompanyService] Ошибка получения компании по ИНН ${taxNumber}:`,
        error,
      );
      throw ApiError.DatabaseError("Ошибка при получении компании");
    }
  }

  async updateCompany(
    userId: string | Types.ObjectId,
    companyId: string | Types.ObjectId,
    updateData: Partial<ICompany>,
  ): Promise<ICompany> {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      }).session(session);
      if (!company) throw ApiError.NotFoundError("Компания не найдена");

      if (updateData.taxNumber) {
        const cleanedTaxNumber = updateData.taxNumber.replace(/\s/g, "");
        const existingCompany = await CompanyModel.findOne({
          user: userId,
          taxNumber: cleanedTaxNumber,
          _id: { $ne: companyId },
        }).session(session);
        if (existingCompany)
          throw ApiError.BadRequest("Компания с таким ИНН уже существует");
        updateData.taxNumber = cleanedTaxNumber;
      }

      Object.assign(company, updateData);
      await company.save({ session });
      await session.commitTransaction();

      await this.invalidateCompanyCache(userId, companyId);
      if (company.taxNumber)
        await this.invalidateCompanyByTaxNumberCache(userId, company.taxNumber);

      logger.info(
        `[CompanyService] Обновлена компания ${companyId} пользователя ${userId}`,
      );
      return company.toObject();
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `[CompanyService] Ошибка обновления компании ${companyId}:`,
        error,
      );
      throw error;
    } finally {
      session.endSession();
    }
  }

  async deleteCompany(
    userId: string | Types.ObjectId,
    companyId: string | Types.ObjectId,
  ): Promise<{ success: boolean; message: string }> {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      }).session(session);
      if (!company) throw ApiError.NotFoundError("Компания не найдена");

      const usedInOrders = await OrderModel.exists({
        "companyInfo.companyId": companyId,
        status: { $nin: ["cancelled", "refunded"] },
      }).session(session);
      if (usedInOrders) {
        throw ApiError.BadRequest(
          "Невозможно удалить компанию, так как она используется в активных заказах",
        );
      }

      await CompanyModel.deleteOne({ _id: companyId }).session(session);
      await session.commitTransaction();

      await this.invalidateCompanyCache(userId, companyId);
      if (company.taxNumber)
        await this.invalidateCompanyByTaxNumberCache(userId, company.taxNumber);

      logger.info(
        `[CompanyService] Удалена компания ${companyId} пользователя ${userId}`,
      );
      return { success: true, message: "Компания успешно удалена" };
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `[CompanyService] Ошибка удаления компании ${companyId}:`,
        error,
      );
      throw error;
    } finally {
      session.endSession();
    }
  }

  async searchCompanies(
    userId: string | Types.ObjectId,
    query: string,
  ): Promise<SearchCompanyResult[]> {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:search:${query}`;
      const cached = await typedRedis.getJson<SearchCompanyResult[]>(cacheKey);
      if (cached) {
        logger.debug(
          `[CompanyService] Результаты поиска компаний "${query}" из кеша`,
        );
        return cached;
      }

      const searchQuery = {
        user: userId,
        $or: [
          { companyName: { $regex: query, $options: "i" } },
          { taxNumber: { $regex: query.replace(/\s/g, ""), $options: "i" } },
        ],
      };
      const companies = await CompanyModel.find(searchQuery)
        .select("-__v")
        .sort({ companyName: 1 })
        .limit(50)
        .lean();

      const result = companies as SearchCompanyResult[];
      await typedRedis.setJson(cacheKey, result, 300);
      return result;
    } catch (error) {
      logger.error(
        `[CompanyService] Ошибка поиска компаний "${query}":`,
        error,
      );
      throw ApiError.DatabaseError("Ошибка при поиске компаний");
    }
  }

  async getDefaultCompany(
    userId: string | Types.ObjectId,
  ): Promise<ICompany | null> {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:default`;
      const cached = await typedRedis.getJson<ICompany>(cacheKey);
      if (cached) return cached;

      const lastOrderWithCompany = await OrderModel.findOne({
        user: userId,
        "companyInfo.companyId": { $exists: true },
      })
        .sort({ createdAt: -1 })
        .populate<{ companyInfo: { companyId: ICompany } }>(
          "companyInfo.companyId",
        )
        .lean();

      if (lastOrderWithCompany?.companyInfo?.companyId) {
        const company = lastOrderWithCompany.companyInfo.companyId;
        await typedRedis.setJson(cacheKey, company, 1800);
        return company;
      }

      const firstCompany = await CompanyModel.findOne({ user: userId })
        .select("-__v")
        .sort({ createdAt: 1 })
        .lean();
      if (firstCompany) await typedRedis.setJson(cacheKey, firstCompany, 1800);
      return firstCompany as ICompany | null;
    } catch (error) {
      logger.error(
        "[CompanyService] Ошибка получения дефолтной компании:",
        error,
      );
      return null;
    }
  }

  private async invalidateCompanyCache(
    userId: string | Types.ObjectId,
    companyId: string | Types.ObjectId,
  ): Promise<void> {
    try {
      const keys = [
        `${this.cachePrefix}user:${userId}:${companyId}`,
        `${this.cachePrefix}user:${userId}:all`,
      ];
      await typedRedis.del(keys);
      logger.debug(`[CompanyService] Инвалидирован кеш компании ${companyId}`);
    } catch (error) {
      logger.error(
        `[CompanyService] Ошибка инвалидации кеша компании ${companyId}:`,
        error,
      );
    }
  }

  private async invalidateCompanyByTaxNumberCache(
    userId: string | Types.ObjectId,
    taxNumber: string,
  ): Promise<void> {
    try {
      const cleaned = taxNumber.replace(/\s/g, "");
      const key = `${this.cachePrefix}user:${userId}:tax:${cleaned}`;
      await typedRedis.del(key);
      logger.debug(
        `[CompanyService] Инвалидирован кеш компании по ИНН ${cleaned}`,
      );
    } catch (error) {
      logger.error(
        `[CompanyService] Ошибка инвалидации кеша компании по ИНН ${taxNumber}:`,
        error,
      );
    }
  }

  private async invalidateUserCompaniesCache(
    userId: string | Types.ObjectId,
  ): Promise<void> {
    try {
      const pattern = `${this.cachePrefix}user:${userId}:*`;
      await typedRedis.deletePattern(pattern);
      logger.debug(
        `[CompanyService] Инвалидирован кеш всех компаний пользователя ${userId}`,
      );
    } catch (error) {
      logger.error(
        `[CompanyService] Ошибка инвалидации кеша компаний пользователя ${userId}:`,
        error,
      );
    }
  }

  async syncCacheAfterChanges(userId: string | Types.ObjectId): Promise<void> {
    try {
      await this.invalidateUserCompaniesCache(userId);
      await typedRedis.del(`${this.cachePrefix}user:${userId}:default`);
      logger.debug(
        `[CompanyService] Кеш компаний синхронизирован для пользователя ${userId}`,
      );
    } catch (error) {
      logger.error("[CompanyService] Ошибка синхронизации кеша:", error);
    }
  }
}

export default new CompanyService();
