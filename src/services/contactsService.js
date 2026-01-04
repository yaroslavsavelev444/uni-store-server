const ApiError = require('../exceptions/api-error');
const logger = require('../logger/logger');
const { ContactModel } = require('../models/index.models');
const redisClient = require('../redis/redis.client');

// Ключи для Redis
const CACHE_KEYS = {
  CONTACTS: 'contacts',
  CONTACTS_ADMIN: 'contacts:admin',
  CONTACTS_ACTIVE: 'contacts:active' // Новый ключ для активных контактов
};

// Время жизни кеша
const CACHE_TTL = {
  PUBLIC: 300,     // 5 минут для публичных данных
  ADMIN: 60,       // 1 минута для админских данных
  ACTIVE: 300      // 5 минут для активных контактов
};

class OrganizationContactService {
  
  /**
   * Получить контакты
   * @param {boolean} isAdmin - является ли пользователь админом
   */
  async getContacts(isAdmin = false) {
    try {
      let cacheKey;
      let cacheTtl;
      
      // Определяем ключ кеша в зависимости от роли пользователя
      if (isAdmin) {
        cacheKey = CACHE_KEYS.CONTACTS_ADMIN;
        cacheTtl = CACHE_TTL.ADMIN;
      } else {
        cacheKey = CACHE_KEYS.CONTACTS_ACTIVE;
        cacheTtl = CACHE_TTL.ACTIVE;
      }
      
      // Пробуем получить из кеша
      if (process.env.CACHE_ENABLED !== 'false') {
        try {
          const cached = await redisClient.getJson(cacheKey);
          if (cached) {
            logger.debug(`Cache hit for ${cacheKey} (isAdmin: ${isAdmin})`);
            return cached;
          }
        } catch (cacheError) {
          logger.warn(`Cache read error for ${cacheKey}:`, cacheError.message);
        }
      }
      
      // Строим фильтр в зависимости от роли пользователя
      const filter = {};
      if (!isAdmin) {
        // Для обычных пользователей - только активные контакты
        filter.isActive = true;
      }
      
      // Получаем из БД
      const contacts = await ContactModel.findOne(filter)
        .lean();
      
      let result;
      
      if (!contacts) {
        if (isAdmin) {
          // Для админа возвращаем структуру по умолчанию даже если нет данных
          result = this.getDefaultStructure();
          result.isActive = false; // По умолчанию неактивно для админа
        } else {
          // Для пользователя возвращаем пустую структуру
          result = this.getEmptyStructureForUsers();
        }
      } else {
        result = contacts;
      }
      
      // Кешируем результат
      if (process.env.CACHE_ENABLED !== 'false') {
        try {
          await redisClient.setJson(cacheKey, result, cacheTtl);
          logger.debug(`Cache set for ${cacheKey} (ttl: ${cacheTtl}s)`);
        } catch (cacheError) {
          logger.warn(`Cache write error for ${cacheKey}:`, cacheError.message);
        }
      }
      
      return result;
      
    } catch (error) {
      logger.error('Error getting contacts:', error);
      throw ApiError.InternalServerError('Ошибка при получении контактов');
    }
  }
  
  /**
   * Получить контакты для админа (всегда все, даже неактивные)
   */
  async getContactsForAdmin() {
    return this.getContacts(true); // Используем общий метод с флагом isAdmin
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
      
      // Ищем существующие контакты (любого статуса, т.к. админ может обновлять)
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
          isActive: data.isActive !== undefined ? data.isActive : false, // По умолчанию неактивны
          updatedBy: userId,
          version: 1
        });
        await contacts.save({ session });
      }
      
      await session.commitTransaction();
      
      // Инвалидируем все кеши контактов
      await this.invalidateAllCaches();
      
      // Получаем обновленные данные для ответа
      const result = await ContactModel.findById(contacts._id)
        .populate('updatedBy', 'email firstName lastName avatar')
        .select('-__v -_id')
        .lean();
      
      logger.info(`Contacts updated by user ${userId}`, {
        userId,
        version: result.version,
        isActive: result.isActive
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
      
      // Ищем контакты (любого статуса, т.к. админ)
      const contacts = await ContactModel.findOne({}).session(session);
      
      if (!contacts) {
        // Если контактов нет, создаем с активным статусом
        const newContacts = new ContactModel({
          companyName: 'Новая компания',
          isActive: true,
          updatedBy: userId,
          version: 1
        });
        await newContacts.save({ session });
        await session.commitTransaction();
        
        // Инвалидируем кеш
        await this.invalidateAllCaches();
        
        logger.info(`New contacts created and activated by user ${userId}`);
        
        return true; // isActive = true
      }
      
      const oldStatus = contacts.isActive;
      contacts.isActive = !oldStatus;
      contacts.updatedBy = userId;
      await contacts.save({ session });
      
      await session.commitTransaction();
      
      // Инвалидируем все кеши контактов
      await this.invalidateAllCaches();
      
      logger.info(`Contacts ${contacts.isActive ? 'activated' : 'deactivated'} by user ${userId}`, {
        userId,
        oldStatus,
        newStatus: contacts.isActive
      });
      
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
   * @param {boolean} isAdmin - является ли пользователь админом
   */
  async exportAsVCard(isAdmin = false) {
    try {
      // Получаем контакты с учетом прав пользователя
      const contacts = await this.getContacts(isAdmin);
      
      // Если контакты не активны и пользователь не админ, возвращаем пустой vCard
      if (!isAdmin && (!contacts || !contacts.isActive)) {
        return this.generateEmptyVCard();
      }
      
      if (!contacts.companyName) {
        throw ApiError.NotFoundError('Контакты не найдены');
      }
      
      return this.generateVCard(contacts);
      
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
   * Инвалидация ВСЕХ кешей контактов
   */
  async invalidateAllCaches() {
    try {
      const keys = [
        CACHE_KEYS.CONTACTS,
        CACHE_KEYS.CONTACTS_ADMIN,
        CACHE_KEYS.CONTACTS_ACTIVE
      ];
      
      await redisClient.bulkDel(keys);
      
      logger.debug('All contacts caches invalidated');
      
    } catch (error) {
      logger.warn('Cache invalidation failed:', error.message);
    }
  }
  
  /**
   * Структура по умолчанию (для админов)
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
      version: 0,
      updatedBy: null
    };
  }
  
  /**
   * Пустая структура для обычных пользователей
   */
  getEmptyStructureForUsers() {
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
  
  /**
   * Генерация пустого vCard
   */
  generateEmptyVCard() {
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Контакты недоступны',
      'ORG:Контакты временно недоступны',
      'NOTE:Контакты временно недоступны. Попробуйте позже.',
      'END:VCARD'
    ].join('\n');
  }
  
  /**
   * Генерация vCard из контактов
   */
  generateVCard(contacts) {
    const vCard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contacts.companyName || 'Компания'}`,
      `ORG:${contacts.companyName || 'Компания'}`
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
    
    // Добавляем заметку о времени работы
    if (contacts.workingHours) {
      vCard.push(`NOTE:Время работы: ${contacts.workingHours}`);
    }
    
    vCard.push('END:VCARD');
    
    return vCard.join('\n');
  }
}

module.exports = new OrganizationContactService();