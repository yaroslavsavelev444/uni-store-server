// services/company.service.js
import { startSession } from "mongoose";
import ApiError from "../exceptions/api-error.js";

const { BadRequest, NotFoundError, DatabaseError } = ApiError;

import logger from "../logger/logger.js";

const { error: _error, debug, info } = logger;

import { CompanyModel, OrderModel } from "../models/index.models.js";
import redis from "../redis/redis.client.js";

const { del, deletePattern, getJson, setJson } = redis;

class CompanyService {
  constructor() {
    this.cachePrefix = "company:";
    this.cacheTTL = 3600; // 1 час
  }

  async checkCompanyOwnership(userId, companyId) {
    try {
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      })
        .select("_id")
        .lean();

      return !!company;
    } catch (error) {
      _error(
        `[CompanyService] Ошибка проверки принадлежности компании ${companyId}:`,
        error,
      );
      throw DatabaseError("Ошибка при проверке компании");
    }
  }

  /**
   * Быстрая проверка доступности компании для заказа
   */
  async validateCompanyForOrder(userId, companyId) {
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
        throw NotFoundError("Компания не найдена или у вас нет к ней доступа");
      }

      // Проверяем необходимые поля для оформления заказа
      const requiredFields = ["companyName", "companyAddress", "taxNumber"];
      const missingFields = requiredFields.filter(
        (field) => !company[field] || company[field].trim() === "",
      );

      if (missingFields.length > 0) {
        throw BadRequest(
          `У компании не заполнены обязательные поля: ${missingFields.join(", ")}`,
        );
      }

      return company;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      _error(`[CompanyService] Ошибка валидации компании ${companyId}:`, error);
      throw DatabaseError("Ошибка при проверке компании");
    }
  }

  /**
   * Получение компаний с минимальной информацией для выбора
   */
  async getCompaniesForSelection(userId) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:selection`;

      const cached = await getJson(cacheKey);
      if (cached) {
        return cached;
      }

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
            lastUsed: null, // Можно добавить логику определения последнего использования
          };
        }),
      );

      await setJson(cacheKey, companiesWithOrderCount, 1800); // 30 минут

      return companiesWithOrderCount;
    } catch (error) {
      _error(`[CompanyService] Ошибка получения компаний для выбора:`, error);
      throw DatabaseError("Ошибка при получении списка компаний");
    }
  }

  /**
   * Создание компании
   */
  async createCompany(userId, companyData) {
    try {
      // Очищаем ИНН от пробелов
      const cleanedTaxNumber = companyData.taxNumber.replace(/\s/g, "");

      // Проверяем уникальность ИНН для пользователя
      const existingCompany = await CompanyModel.findOne({
        user: userId,
        taxNumber: cleanedTaxNumber,
      });

      if (existingCompany) {
        throw BadRequest("Компания с таким ИНН уже существует");
      }

      // Создаем компанию
      const company = await CompanyModel.create({
        ...companyData,
        user: userId,
        taxNumber: cleanedTaxNumber,
      });

      // Инвалидируем кеш списка компаний пользователя
      await this.invalidateUserCompaniesCache(userId);

      info(
        `[CompanyService] Создана компания ${company._id} для пользователя ${userId}`,
      );

      return company;
    } catch (error) {
      if (error.code === 11000) {
        throw BadRequest("Компания с таким ИНН уже существует");
      }
      throw error;
    }
  }

  /**
   * Получение всех компаний пользователя
   */
  async getUserCompanies(userId) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:all`;

      // Пробуем получить из кеша
      const cached = await getJson(cacheKey);
      if (cached) {
        debug(
          `[CompanyService] Получены компании пользователя ${userId} из кеша`,
        );
        return cached;
      }

      // Получаем из базы
      const companies = await CompanyModel.find({ user: userId })
        .select("-__v")
        .sort({ createdAt: -1 })
        .lean();

      // Сохраняем в кеш
      await setJson(cacheKey, companies, this.cacheTTL);

      debug(`[CompanyService] Получены компании пользователя ${userId} из БД`);

      return companies;
    } catch (error) {
      _error(
        `[CompanyService] Ошибка получения компаний пользователя ${userId}:`,
        error,
      );
      throw DatabaseError("Ошибка при получении списка компаний");
    }
  }

  /**
   * Получение компании по ID
   */
  async getCompanyById(userId, companyId) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:${companyId}`;

      // Пробуем получить из кеша
      const cached = await getJson(cacheKey);
      if (cached) {
        debug(`[CompanyService] Получена компания ${companyId} из кеша`);
        return cached;
      }

      // Получаем из базы
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      })
        .select("-__v")
        .lean();

      if (!company) {
        throw NotFoundError("Компания не найдена");
      }

      // Сохраняем в кеш
      await setJson(cacheKey, company, this.cacheTTL);

      return company;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      _error(`[CompanyService] Ошибка получения компании ${companyId}:`, error);
      throw DatabaseError("Ошибка при получении компании");
    }
  }

  /**
   * Получение компании по ИНН
   */
  async getCompanyByTaxNumber(userId, taxNumber) {
    try {
      const cleanedTaxNumber = taxNumber.replace(/\s/g, "");
      const cacheKey = `${this.cachePrefix}user:${userId}:tax:${cleanedTaxNumber}`;

      // Пробуем получить из кеша
      const cached = await getJson(cacheKey);
      if (cached) {
        debug(
          `[CompanyService] Получена компания по ИНН ${cleanedTaxNumber} из кеша`,
        );
        return cached;
      }

      // Получаем из базы
      const company = await CompanyModel.findOne({
        user: userId,
        taxNumber: cleanedTaxNumber,
      })
        .select("-__v")
        .lean();

      if (!company) {
        throw NotFoundError("Компания не найдена");
      }

      // Сохраняем в кеш
      await setJson(cacheKey, company, this.cacheTTL);

      return company;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      _error(
        `[CompanyService] Ошибка получения компании по ИНН ${taxNumber}:`,
        error,
      );
      throw DatabaseError("Ошибка при получении компании");
    }
  }

  /**
   * Обновление компании
   */
  async updateCompany(userId, companyId, updateData) {
    const session = await startSession();

    try {
      session.startTransaction();

      // Проверяем существование компании
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      }).session(session);

      if (!company) {
        throw NotFoundError("Компания не найдена");
      }

      // Если обновляется ИНН, проверяем уникальность
      if (updateData.taxNumber) {
        const cleanedTaxNumber = updateData.taxNumber.replace(/\s/g, "");

        // Проверяем, не используется ли ИНН другой компанией
        const existingCompany = await CompanyModel.findOne({
          user: userId,
          taxNumber: cleanedTaxNumber,
          _id: { $ne: companyId },
        }).session(session);

        if (existingCompany) {
          throw BadRequest("Компания с таким ИНН уже существует");
        }

        updateData.taxNumber = cleanedTaxNumber;
      }

      // Обновляем компанию
      Object.assign(company, updateData);
      await company.save({ session });

      await session.commitTransaction();

      // Инвалидируем кеш
      await this.invalidateCompanyCache(userId, companyId);
      if (company.taxNumber) {
        await this.invalidateCompanyByTaxNumberCache(userId, company.taxNumber);
      }

      info(
        `[CompanyService] Обновлена компания ${companyId} пользователя ${userId}`,
      );

      return company.toObject();
    } catch (error) {
      await session.abortTransaction();
      _error(
        `[CompanyService] Ошибка обновления компании ${companyId}:`,
        error,
      );
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Удаление компании
   */
  async deleteCompany(userId, companyId) {
    const session = await startSession();

    try {
      session.startTransaction();

      // Находим компанию
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId,
      }).session(session);

      if (!company) {
        throw NotFoundError("Компания не найдена");
      }

      // Проверяем, не используется ли компания в заказах
      const usedInOrders = await OrderModel.exists({
        "companyInfo.companyId": companyId,
        status: { $nin: ["cancelled", "refunded"] },
      }).session(session);

      if (usedInOrders) {
        throw BadRequest(
          "Невозможно удалить компанию, так как она используется в активных заказах",
        );
      }

      // Удаляем компанию
      await CompanyModel.deleteOne({ _id: companyId }).session(session);

      await session.commitTransaction();

      // Инвалидируем кеш
      await this.invalidateCompanyCache(userId, companyId);
      if (company.taxNumber) {
        await this.invalidateCompanyByTaxNumberCache(userId, company.taxNumber);
      }

      info(
        `[CompanyService] Удалена компания ${companyId} пользователя ${userId}`,
      );

      return { success: true, message: "Компания успешно удалена" };
    } catch (error) {
      await session.abortTransaction();
      _error(`[CompanyService] Ошибка удаления компании ${companyId}:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Поиск компаний по названию или ИНН
   */
  async searchCompanies(userId, query) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:search:${query}`;

      // Пробуем получить из кеша (кешируем на 5 минут)
      const cached = await getJson(cacheKey);
      if (cached) {
        debug(`[CompanyService] Результаты поиска компаний "${query}" из кеша`);
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

      // Сохраняем в кеш на 5 минут
      await setJson(cacheKey, companies, 300);

      return companies;
    } catch (error) {
      _error(`[CompanyService] Ошибка поиска компаний "${query}":`, error);
      throw DatabaseError("Ошибка при поиске компаний");
    }
  }

  /**
   * Получение дефолтной компании пользователя
   */
  async getDefaultCompany(userId) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:default`;

      // Пробуем получить из кеша
      const cached = await getJson(cacheKey);
      if (cached) {
        return cached;
      }
      const lastOrderWithCompany = await OrderModel.findOne({
        user: userId,
        "companyInfo.companyId": { $exists: true },
      })
        .sort({ createdAt: -1 })
        .populate("companyInfo.companyId")
        .lean();

      if (lastOrderWithCompany && lastOrderWithCompany.companyInfo.companyId) {
        const company = lastOrderWithCompany.companyInfo.companyId;
        // Сохраняем в кеш на 30 минут
        await setJson(cacheKey, company, 1800);
        return company;
      }

      // Если нет заказов с компаниями, берем первую компанию пользователя
      const firstCompany = await CompanyModel.findOne({ user: userId })
        .select("-__v")
        .sort({ createdAt: 1 })
        .lean();

      if (firstCompany) {
        // Сохраняем в кеш на 30 минут
        await setJson(cacheKey, firstCompany, 1800);
      }

      return firstCompany;
    } catch (error) {
      _error(`[CompanyService] Ошибка получения дефолтной компании:`, error);
      return null;
    }
  }

  /**
   * Инвалидация кеша компании
   */
  async invalidateCompanyCache(userId, companyId) {
    try {
      const cacheKeys = [
        `${this.cachePrefix}user:${userId}:${companyId}`,
        `${this.cachePrefix}user:${userId}:all`,
      ];

      await del(cacheKeys);
      debug(`[CompanyService] Инвалидирован кеш компании ${companyId}`);
    } catch (error) {
      _error(
        `[CompanyService] Ошибка инвалидации кеша компании ${companyId}:`,
        error,
      );
    }
  }

  /**
   * Инвалидация кеша компании по ИНН
   */
  async invalidateCompanyByTaxNumberCache(userId, taxNumber) {
    try {
      const cleanedTaxNumber = taxNumber.replace(/\s/g, "");
      const cacheKey = `${this.cachePrefix}user:${userId}:tax:${cleanedTaxNumber}`;
      await del(cacheKey);
      debug(
        `[CompanyService] Инвалидирован кеш компании по ИНН ${cleanedTaxNumber}`,
      );
    } catch (error) {
      _error(
        `[CompanyService] Ошибка инвалидации кеша компании по ИНН ${taxNumber}:`,
        error,
      );
    }
  }

  /**
   * Инвалидация кеша всех компаний пользователя
   */
  async invalidateUserCompaniesCache(userId) {
    try {
      // Удаляем все кеши связанные с компаниями пользователя
      const pattern = `${this.cachePrefix}user:${userId}:*`;
      await deletePattern(pattern);
      debug(
        `[CompanyService] Инвалидирован кеш всех компаний пользователя ${userId}`,
      );
    } catch (error) {
      _error(
        `[CompanyService] Ошибка инвалидации кеша компаний пользователя ${userId}:`,
        error,
      );
    }
  }

  /**
   * Синхронизация кеша после изменений
   */
  async syncCacheAfterChanges(userId) {
    try {
      await this.invalidateUserCompaniesCache(userId);

      // Обновляем дефолтную компанию
      await del(`${this.cachePrefix}user:${userId}:default`);

      debug(
        `[CompanyService] Кеш компаний синхронизирован для пользователя ${userId}`,
      );
    } catch (error) {
      _error(`[CompanyService] Ошибка синхронизации кеша:`, error);
    }
  }
}

export default new CompanyService();
