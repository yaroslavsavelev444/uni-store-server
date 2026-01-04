// services/company.service.js
const mongoose = require('mongoose');
const ApiError = require('../exceptions/api-error');
const redisClient = require('../redis/redis.client');
const logger = require('../logger/logger');
const { CompanyModel, OrderModel } = require('../models/index.models');

class CompanyService {
  constructor() {
    this.cachePrefix = 'company:';
    this.cacheTTL = 3600; // 1 час
  }

  async checkCompanyOwnership(userId, companyId) {
    try {
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId
      }).select('_id').lean();

      return !!company;
      
    } catch (error) {
      logger.error(`[CompanyService] Ошибка проверки принадлежности компании ${companyId}:`, error);
      throw ApiError.DatabaseError('Ошибка при проверке компании');
    }
  }

  /**
   * Быстрая проверка доступности компании для заказа
   */
  async validateCompanyForOrder(userId, companyId) {
    try {
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId
      }).select('companyName companyAddress taxNumber legalAddress contactPerson').lean();

      if (!company) {
        throw ApiError.NotFound('Компания не найдена или у вас нет к ней доступа');
      }

      // Проверяем необходимые поля для оформления заказа
      const requiredFields = ['companyName', 'companyAddress', 'taxNumber'];
      const missingFields = requiredFields.filter(field => !company[field] || company[field].trim() === '');
      
      if (missingFields.length > 0) {
        throw ApiError.BadRequest(
          `У компании не заполнены обязательные поля: ${missingFields.join(', ')}`
        );
      }

      return company;
      
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[CompanyService] Ошибка валидации компании ${companyId}:`, error);
      throw ApiError.DatabaseError('Ошибка при проверке компании');
    }
  }

  /**
   * Получение компаний с минимальной информацией для выбора
   */
  async getCompaniesForSelection(userId) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:selection`;
      
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }

      const companies = await CompanyModel.find({ user: userId })
        .select('companyName taxNumber companyAddress contactPerson')
        .sort({ companyName: 1 })
        .lean();

      const companiesWithOrderCount = await Promise.all(
        companies.map(async (company) => {
          const orderCount = await OrderModel.countDocuments({
            'companyInfo.companyId': company._id,
            status: { $nin: ['cancelled', 'refunded'] }
          });
          
          return {
            ...company,
            orderCount,
            lastUsed: null // Можно добавить логику определения последнего использования
          };
        })
      );

      await redisClient.setJson(cacheKey, companiesWithOrderCount, 1800); // 30 минут
      
      return companiesWithOrderCount;
      
    } catch (error) {
      logger.error(`[CompanyService] Ошибка получения компаний для выбора:`, error);
      throw ApiError.DatabaseError('Ошибка при получении списка компаний');
    }
  }


  /**
   * Создание компании
   */
  async createCompany(userId, companyData) {
    try {
      // Очищаем ИНН от пробелов
      const cleanedTaxNumber = companyData.taxNumber.replace(/\s/g, '');
      
      // Проверяем уникальность ИНН для пользователя
      const existingCompany = await CompanyModel.findOne({
        user: userId,
        taxNumber: cleanedTaxNumber
      });

      if (existingCompany) {
        throw ApiError.BadRequest('Компания с таким ИНН уже существует');
      }

      // Создаем компанию
      const company = await CompanyModel.create({
        ...companyData,
        user: userId,
        taxNumber: cleanedTaxNumber
      });

      // Инвалидируем кеш списка компаний пользователя
      await this.invalidateUserCompaniesCache(userId);

      logger.info(`[CompanyService] Создана компания ${company._id} для пользователя ${userId}`);
      
      return company;
      
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.BadRequest('Компания с таким ИНН уже существует');
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
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[CompanyService] Получены компании пользователя ${userId} из кеша`);
        return cached;
      }

      // Получаем из базы
      const companies = await CompanyModel.find({ user: userId })
        .select('-__v')
        .sort({ createdAt: -1 })
        .lean();

      // Сохраняем в кеш
      await redisClient.setJson(cacheKey, companies, this.cacheTTL);
      
      logger.debug(`[CompanyService] Получены компании пользователя ${userId} из БД`);
      
      return companies;
      
    } catch (error) {
      logger.error(`[CompanyService] Ошибка получения компаний пользователя ${userId}:`, error);
      throw ApiError.DatabaseError('Ошибка при получении списка компаний');
    }
  }

  /**
   * Получение компании по ID
   */
  async getCompanyById(userId, companyId) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:${companyId}`;
      
      // Пробуем получить из кеша
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[CompanyService] Получена компания ${companyId} из кеша`);
        return cached;
      }

      // Получаем из базы
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId
      }).select('-__v').lean();

      if (!company) {
        throw ApiError.NotFound('Компания не найдена');
      }

      // Сохраняем в кеш
      await redisClient.setJson(cacheKey, company, this.cacheTTL);
      
      return company;
      
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[CompanyService] Ошибка получения компании ${companyId}:`, error);
      throw ApiError.DatabaseError('Ошибка при получении компании');
    }
  }

  /**
   * Получение компании по ИНН
   */
  async getCompanyByTaxNumber(userId, taxNumber) {
    try {
      const cleanedTaxNumber = taxNumber.replace(/\s/g, '');
      const cacheKey = `${this.cachePrefix}user:${userId}:tax:${cleanedTaxNumber}`;
      
      // Пробуем получить из кеша
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[CompanyService] Получена компания по ИНН ${cleanedTaxNumber} из кеша`);
        return cached;
      }

      // Получаем из базы
      const company = await CompanyModel.findOne({
        user: userId,
        taxNumber: cleanedTaxNumber
      }).select('-__v').lean();

      if (!company) {
        throw ApiError.NotFound('Компания не найдена');
      }

      // Сохраняем в кеш
      await redisClient.setJson(cacheKey, company, this.cacheTTL);
      
      return company;
      
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[CompanyService] Ошибка получения компании по ИНН ${taxNumber}:`, error);
      throw ApiError.DatabaseError('Ошибка при получении компании');
    }
  }

  /**
   * Обновление компании
   */
  async updateCompany(userId, companyId, updateData) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      // Проверяем существование компании
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId
      }).session(session);

      if (!company) {
        throw ApiError.NotFound('Компания не найдена');
      }

      // Если обновляется ИНН, проверяем уникальность
      if (updateData.taxNumber) {
        const cleanedTaxNumber = updateData.taxNumber.replace(/\s/g, '');
        
        // Проверяем, не используется ли ИНН другой компанией
        const existingCompany = await CompanyModel.findOne({
          user: userId,
          taxNumber: cleanedTaxNumber,
          _id: { $ne: companyId }
        }).session(session);

        if (existingCompany) {
          throw ApiError.BadRequest('Компания с таким ИНН уже существует');
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

      logger.info(`[CompanyService] Обновлена компания ${companyId} пользователя ${userId}`);
      
      return company.toObject();
      
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[CompanyService] Ошибка обновления компании ${companyId}:`, error);
      throw error;
      
    } finally {
      session.endSession();
    }
  }

  /**
   * Удаление компании
   */
  async deleteCompany(userId, companyId) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      // Находим компанию
      const company = await CompanyModel.findOne({
        _id: companyId,
        user: userId
      }).session(session);

      if (!company) {
        throw ApiError.NotFound('Компания не найдена');
      }

      // Проверяем, не используется ли компания в заказах
      const OrderModel = require('../models/order-model').OrderModel;
      const usedInOrders = await OrderModel.exists({
        'companyInfo.companyId': companyId,
        status: { $nin: ['cancelled', 'refunded'] }
      }).session(session);

      if (usedInOrders) {
        throw ApiError.BadRequest('Невозможно удалить компанию, так как она используется в активных заказах');
      }

      // Удаляем компанию
      await CompanyModel.deleteOne({ _id: companyId }).session(session);

      await session.commitTransaction();

      // Инвалидируем кеш
      await this.invalidateCompanyCache(userId, companyId);
      if (company.taxNumber) {
        await this.invalidateCompanyByTaxNumberCache(userId, company.taxNumber);
      }

      logger.info(`[CompanyService] Удалена компания ${companyId} пользователя ${userId}`);
      
      return { success: true, message: 'Компания успешно удалена' };
      
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[CompanyService] Ошибка удаления компании ${companyId}:`, error);
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
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[CompanyService] Результаты поиска компаний "${query}" из кеша`);
        return cached;
      }

      const searchQuery = {
        user: userId,
        $or: [
          { companyName: { $regex: query, $options: 'i' } },
          { taxNumber: { $regex: query.replace(/\s/g, ''), $options: 'i' } }
        ]
      };

      const companies = await CompanyModel.find(searchQuery)
        .select('-__v')
        .sort({ companyName: 1 })
        .limit(20)
        .lean();

      // Сохраняем в кеш на 5 минут
      await redisClient.setJson(cacheKey, companies, 300);
      
      return companies;
      
    } catch (error) {
      logger.error(`[CompanyService] Ошибка поиска компаний "${query}":`, error);
      throw ApiError.DatabaseError('Ошибка при поиске компаний');
    }
  }

  /**
   * Получение дефолтной компании пользователя
   */
  async getDefaultCompany(userId) {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}:default`;
      
      // Пробуем получить из кеша
      const cached = await redisClient.getJson(cacheKey);
      if (cached) {
        return cached;
      }

      // Ищем последнюю использованную компанию (например, в заказах)
      const OrderModel = require('../models/order-model').OrderModel;
      const lastOrderWithCompany = await OrderModel.findOne({
        user: userId,
        'companyInfo.companyId': { $exists: true }
      })
      .sort({ createdAt: -1 })
      .populate('companyInfo.companyId')
      .lean();

      if (lastOrderWithCompany && lastOrderWithCompany.companyInfo.companyId) {
        const company = lastOrderWithCompany.companyInfo.companyId;
        // Сохраняем в кеш на 30 минут
        await redisClient.setJson(cacheKey, company, 1800);
        return company;
      }

      // Если нет заказов с компаниями, берем первую компанию пользователя
      const firstCompany = await CompanyModel.findOne({ user: userId })
        .select('-__v')
        .sort({ createdAt: 1 })
        .lean();

      if (firstCompany) {
        // Сохраняем в кеш на 30 минут
        await redisClient.setJson(cacheKey, firstCompany, 1800);
      }

      return firstCompany;
      
    } catch (error) {
      logger.error(`[CompanyService] Ошибка получения дефолтной компании:`, error);
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
        `${this.cachePrefix}user:${userId}:all`
      ];
      
      await redisClient.del(cacheKeys);
      logger.debug(`[CompanyService] Инвалидирован кеш компании ${companyId}`);
    } catch (error) {
      logger.error(`[CompanyService] Ошибка инвалидации кеша компании ${companyId}:`, error);
    }
  }

  /**
   * Инвалидация кеша компании по ИНН
   */
  async invalidateCompanyByTaxNumberCache(userId, taxNumber) {
    try {
      const cleanedTaxNumber = taxNumber.replace(/\s/g, '');
      const cacheKey = `${this.cachePrefix}user:${userId}:tax:${cleanedTaxNumber}`;
      await redisClient.del(cacheKey);
      logger.debug(`[CompanyService] Инвалидирован кеш компании по ИНН ${cleanedTaxNumber}`);
    } catch (error) {
      logger.error(`[CompanyService] Ошибка инвалидации кеша компании по ИНН ${taxNumber}:`, error);
    }
  }

  /**
   * Инвалидация кеша всех компаний пользователя
   */
  async invalidateUserCompaniesCache(userId) {
    try {
      // Удаляем все кеши связанные с компаниями пользователя
      const pattern = `${this.cachePrefix}user:${userId}:*`;
      await redisClient.deletePattern(pattern);
      logger.debug(`[CompanyService] Инвалидирован кеш всех компаний пользователя ${userId}`);
    } catch (error) {
      logger.error(`[CompanyService] Ошибка инвалидации кеша компаний пользователя ${userId}:`, error);
    }
  }

  /**
   * Синхронизация кеша после изменений
   */
  async syncCacheAfterChanges(userId) {
    try {
      await this.invalidateUserCompaniesCache(userId);
      
      // Обновляем дефолтную компанию
      await redisClient.del(`${this.cachePrefix}user:${userId}:default`);
      
      logger.debug(`[CompanyService] Кеш компаний синхронизирован для пользователя ${userId}`);
    } catch (error) {
      logger.error(`[CompanyService] Ошибка синхронизации кеша:`, error);
    }
  }
}

module.exports = new CompanyService();