const ApiError = require('../exceptions/api-error');
const logger = require('../logger/logger');
const { ContactModel } = require('../models/index.models');
const redisClient = require('../redis/redis.client');

// Ключи для Redis
const CACHE_KEYS = {
  CONTACTS: 'contacts',
  CONTACTS_ADMIN: 'contacts:admin'
};

// Время жизни кеша (5 минут)
const CACHE_TTL = 300;

class OrganizationContactService {
  
  /**
   * Получить контакты (с кешированием)
   */
  async getContacts(admin = false) {
    try {
      const cacheKey = CACHE_KEYS.CONTACTS;
      
      // Пробуем получить из кеша
      if (!admin && process.env.CACHE_ENABLED !== 'false') {
        try {
          const cached = await redisClient.getJson(cacheKey);
          if (cached) {
            logger.debug(`Cache hit for ${cacheKey}`);
            return cached;
          }
        } catch (cacheError) {
          logger.warn(`Cache read error for ${cacheKey}:`, cacheError.message);
          // Продолжаем без кеша при ошибке
        }
      }
      
      // Получаем из БД (всегда первый документ для синглтона)
      const contacts = await ContactModel.findOne({})
        .select(!admin ? '-updatedBy -__v -_id' : '')
        .lean();
      
      // Если нет данных, возвращаем структуру по умолчанию
      if (!contacts) {
        const defaultStructure = this.getDefaultStructure();
        
        // Кешируем только если не админ и кеш включен
        if (!admin && process.env.CACHE_ENABLED !== 'false') {
          try {
            await redisClient.setJson(cacheKey, defaultStructure, CACHE_TTL);
          } catch (cacheError) {
            logger.warn(`Cache write error for ${cacheKey}:`, cacheError.message);
          }
        }
        
        return defaultStructure;
      }
      
      // Кешируем только если не админ и кеш включен
      if (!admin && process.env.CACHE_ENABLED !== 'false') {
        try {
          await redisClient.setJson(cacheKey, contacts, CACHE_TTL);
        } catch (cacheError) {
          logger.warn(`Cache write error for ${cacheKey}:`, cacheError.message);
        }
      }
      
      return contacts;
      
    } catch (error) {
      logger.error('Error getting contacts:', error);
      throw ApiError.InternalServerError('Ошибка при получении контактов');
    }
  }
  
  /**
   * Получить контакты для админа (с отдельным кешем)
   */
  async getContactsForAdmin() {
    try {
      const cacheKey = CACHE_KEYS.CONTACTS_ADMIN;
      
      // Пробуем получить из кеша (кеш админских данных на 1 минуту)
      if (process.env.CACHE_ENABLED !== 'false') {
        try {
          const cached = await redisClient.getJson(cacheKey);
          if (cached) {
            logger.debug(`Admin cache hit for ${cacheKey}`);
            return cached;
          }
        } catch (cacheError) {
          logger.warn(`Admin cache read error for ${cacheKey}:`, cacheError.message);
        }
      }
      
      const contacts = await ContactModel.findOne({})
        .populate('updatedBy', 'email firstName lastName avatar')
        .lean();
      
      const result = contacts || this.getDefaultStructure();
      
      // Кешируем админские данные на 1 минуту
      if (process.env.CACHE_ENABLED !== 'false') {
        try {
          await redisClient.setJson(cacheKey, result, 60); // 1 минута для админских данных
        } catch (cacheError) {
          logger.warn(`Admin cache write error for ${cacheKey}:`, cacheError.message);
        }
      }
      
      return result;
      
    } catch (error) {
      logger.error('Error getting contacts for admin:', error);
      throw ApiError.InternalServerError('Ошибка при получении контактов для админа');
    }
  }
  
  /**
   * Обновить контакты
   */
  async updateContacts(data, userId) {
    const session = await ContactModel.startSession();
    
    try {
      session.startTransaction();
      
      // Валидируем URL социальных сетей перед сохранением
      if (data.socialLinks && Array.isArray(data.socialLinks)) {
        for (const link of data.socialLinks) {
          this.validateSocialUrl(link.platform, link.url);
        }
      }
      
      // Ищем существующие контакты
      let contacts = await ContactModel.findOne({}).session(session);
      
      if (contacts) {
        // Обновляем существующие
        Object.keys(data).forEach(key => {
          if (data[key] !== undefined) {
            contacts[key] = data[key];
          }
        });
        
        contacts.updatedBy = userId;
        contacts.version = (contacts.version || 0) + 1;
        await contacts.save({ session });
        
      } else {
        // Создаем новые
        contacts = new ContactModel({
          ...data,
          updatedBy: userId,
          version: 1
        });
        await contacts.save({ session });
      }
      
      await session.commitTransaction();
      
      // Инвалидируем кеш
      await this.invalidateCache();
      
      // Получаем обновленные данные
      const result = await ContactModel.findById(contacts._id)
        .select('-__v -_id')
        .lean();
      
      logger.info(`Contacts updated by user ${userId}`, {
        userId,
        version: result.version
      });
      
      return result;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error updating contacts:', error);
      
      if (error.code === 11000) {
        throw ApiError.BadRequest('Контакты уже существуют');
      }
      
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        throw ApiError.BadRequest('Ошибка валидации', errors);
      }
      
      if (error.message && error.message.includes('URL для')) {
        throw ApiError.BadRequest(error.message);
      }
      
      // Проверяем, что это не ApiError, чтобы не перезаписать
      if (!(error instanceof ApiError)) {
        throw ApiError.InternalServerError('Ошибка при обновлении контактов');
      }
      
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Изменить статус активности
   */
  async toggleActive(userId) {
    const session = await ContactModel.startSession();
    
    try {
      session.startTransaction();
      
      const contacts = await ContactModel.findOne({}).session(session);
      
      if (!contacts) {
        throw ApiError.NotFoundError('Контакты не найдены');
      }
      
      const oldStatus = contacts.isActive;
      contacts.isActive = !oldStatus;
      contacts.updatedBy = userId;
      await contacts.save({ session });
      
      await session.commitTransaction();
      
      // Инвалидируем кеш
      await this.invalidateCache();
      
      logger.info(`Contacts ${contacts.isActive ? 'activated' : 'deactivated'} by user ${userId}`);
      
      return contacts.isActive;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error toggling active status:', error);
      throw error instanceof ApiError ? error : ApiError.InternalServerError('Ошибка при изменении статуса');
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Получить историю изменений
   */
  async getChangeHistory(limit = 10) {
    try {
      // В реальной реализации здесь был бы запрос к коллекции истории
      // Для примера возвращаем заглушку
      return {
        changes: [],
        total: 0
      };
      
    } catch (error) {
      logger.error('Error getting change history:', error);
      throw ApiError.InternalServerError('Ошибка при получении истории изменений');
    }
  }
  
  /**
   * Экспорт контактов в формате vCard
   */
  async exportAsVCard() {
    try {
      const contacts = await this.getContacts();
      
      if (!contacts.companyName) {
        throw ApiError.NotFoundError('Контакты не найдены');
      }
      
      // Формируем vCard
      const vCard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${contacts.companyName}`,
        `ORG:${contacts.companyName}`
      ];
      
      // Добавляем телефоны
      if (contacts.phones && contacts.phones.length > 0) {
        contacts.phones.forEach(phone => {
          const type = phone.type === 'support' ? 'WORK' : 'OTHER';
          vCard.push(`TEL;TYPE=${type}:${phone.value}`);
        });
      }
      
      // Добавляем email
      if (contacts.emails && contacts.emails.length > 0) {
        contacts.emails.forEach(email => {
          vCard.push(`EMAIL:${email.value}`);
        });
      }
      
      // Добавляем адрес
      if (contacts.physicalAddress) {
        vCard.push(`ADR:;;${contacts.physicalAddress}`);
      }
      
      vCard.push('END:VCARD');
      
      return vCard.join('\n');
      
    } catch (error) {
      logger.error('Error exporting vCard:', error);
      throw error instanceof ApiError ? error : ApiError.InternalServerError('Ошибка при экспорте контактов');
    }
  }
  
  /**
   * Проверка здоровья
   */
  async healthCheck() {
    try {
      const dbCheck = await ContactModel.findOne({}).select('_id').lean();
      const redisCheck = await redisClient.ping();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {
          database: dbCheck ? 'connected' : 'error',
          redis: redisCheck === 'PONG' ? 'connected' : 'error',
          cache: process.env.CACHE_ENABLED || 'enabled'
        }
      };
      
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
  
  /**
   * Инвалидация кеша
   */
  async invalidateCache() {
    try {
      const keys = [
        CACHE_KEYS.CONTACTS,
        CACHE_KEYS.CONTACTS_ADMIN
      ];
      
      await redisClient.bulkDel(keys);
      
      logger.debug('Cache invalidated');
      
    } catch (error) {
      logger.warn('Cache invalidation failed:', error.message);
      // Не прерываем выполнение если кеш не очистился
    }
  }
  
  /**
   * Структура по умолчанию
   */
  getDefaultStructure() {
    return {
      companyName: '',
      legalAddress: '',
      physicalAddress: '',
      phones: [],
      emails: [],
      socialLinks: [],
      otherContacts: [],
      workingHours: '',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0
    };
  }
  
  /**
   * Валидация URL социальных сетей
   */
  validateSocialUrl(platform, url) {
    const domainMap = {
      'vk': 'vk.com',
      'telegram': 't.me',
      'whatsapp': 'wa.me',
      'youtube': 'youtube.com',
      'linkedin': 'linkedin.com',
      'github': 'github.com',
      'twitter': 'twitter.com',
      'facebook': 'facebook.com',
      'instagram': 'instagram.com'
    };
    
    if (domainMap[platform] && !url.includes(domainMap[platform])) {
      throw new Error(`URL для ${platform} должен содержать домен ${domainMap[platform]}`);
    }
    
    return true;
  }
}

module.exports = new OrganizationContactService();