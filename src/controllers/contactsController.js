const ApiError = require("../exceptions/api-error");
const contactsService = require("../services/contactsService");
const logger = require('../logger/logger');

class СontactsController {
  
  /**
   * Получить контакты (публичный доступ)
   */
  async getContacts(req, res, next) {
    try {
      const contacts = await contactsService.getContacts();
      
      // Если контакты неактивны, возвращаем 404 для не-админов
      if (!contacts.isActive && !req.user?.role?.includes('admin')) {
        return next(ApiError.NotFoundError('Контакты временно недоступны'));
      }
      
      // Устанавливаем заголовки для кеширования на клиенте
      res.set({
        'Cache-Control': 'public, max-age=300', // 5 минут
        'ETag': `"${contacts.version}-${contacts.updatedAt?.getTime() || 0}"`,
        'Last-Modified': contacts.updatedAt?.toUTCString() || new Date().toUTCString()
      });
      
      // Проверка If-None-Match для HTTP кеширования
      const clientETag = req.headers['if-none-match'];
      if (clientETag === `"${contacts.version}-${contacts.updatedAt?.getTime() || 0}"`) {
        return res.status(304).end(); // Not Modified
      }
      
      res.json({
        success: true,
        data: contacts,
        meta: {
          version: contacts.version,
          cache: process.env.CACHE_ENABLED !== 'false'
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Получить контакты для админа
   */
  async getAdminContacts(req, res, next) {
    try {
      const contacts = await contactsService.getContactsForAdmin();
      
      res.json({
        success: true,
        data: contacts
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Обновить контакты
   */
  async updateContacts(req, res, next) {
    try {
      const userId = req.user.id;
      
      const contacts = await contactsService.updateContacts(
        req.body, 
        userId
      );
      
      logger.info(`User ${userId} updated contacts`, {
        userId,
        changes: Object.keys(req.body)
      });
      
      res.json({
        success: true,
        message: 'Контакты успешно обновлены',
        data: contacts,
        meta: {
          updatedBy: userId,
          version: contacts.version,
          cacheInvalidated: true
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Переключить активность
   */
  async toggleActive(req, res, next) {
    try {
      const userId = req.user.id;
      
      const isActive = await contactsService.toggleActive(userId);
      
      res.json({
        success: true,
        message: `Контакты ${isActive ? 'активированы' : 'деактивированы'}`,
        data: { 
          isActive
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Получить историю изменений
   */
  async getChangeHistory(req, res, next) {
    try {
      const { limit = 10 } = req.query;
      
      const history = await contactsService.getChangeHistory(parseInt(limit));
      
      res.json({
        success: true,
        data: history
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Экспорт в vCard
   */
  async exportVCard(req, res, next) {
    try {
      const vCard = await contactsService.exportAsVCard();
      
      // Устанавливаем заголовки для скачивания
      res.set({
        'Content-Type': 'text/vcard',
        'Content-Disposition': 'attachment; filename="contacts.vcf"',
        'Content-Length': Buffer.byteLength(vCard, 'utf8')
      });
      
      res.send(vCard);
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Health check
   */
  async healthCheck(req, res, next) {
    try {
      const health = await contactsService.healthCheck();
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: health.status === 'healthy',
        ...health
      });
      
    } catch (error) {
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
}

module.exports = new СontactsController();