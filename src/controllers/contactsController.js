const ApiError = require("../exceptions/api-error");
const contactsService = require("../services/contactsService");
const logger = require('../logger/logger');

class СontactsController {
  
  /**
   * Получить контакты (публичный доступ) - ТОЛЬКО АКТИВНЫЕ
   */
  async getContacts(req, res, next) {
    try {
      // Защита от undefined req
      if (!req) {
        logger.warn('Request object is null in getContacts');
        return res.json({
          success: true,
          data: contactsService.getEmptyStructureForUsers(),
          message: 'Контакты временно недоступны'
        });
      }
      
      // Флаг, является ли пользователь админом
      const isAdmin = (req.user && req.user.role && req.user.role.includes('admin')) || false;
      
      // Для обычных пользователей всегда получаем только активные контакты
      const contacts = await contactsService.getContacts(isAdmin);
      
      // Для обычных пользователей проверяем, активны ли контакты
      if (!isAdmin) {
        // Если контакты не найдены или неактивны, возвращаем пустую структуру
        if (!contacts || !contacts.isActive) {
          return res.json({
            success: true,
            data: contactsService.getEmptyStructureForUsers(),
            message: 'Контакты временно недоступны'
          });
        }
      }
      
      res.json({
        success: true,
        data: contacts,
        meta: {
          version: contacts.version || 0,
          cache: !isAdmin,
          isAdmin: isAdmin
        }
      });
      
    } catch (error) {
      logger.error('Error in getContacts:', error);
      
      // В случае ошибки возвращаем пустую структуру для пользователей
      if (error.status === 404 || error.message?.includes('не найдены')) {
        return res.json({
          success: true,
          data: contactsService.getEmptyStructureForUsers(),
          message: 'Контакты временно недоступны'
        });
      }
      
      next(error);
    }
  }
  
  /**
   * Получить контакты для админа (все, включая неактивные)
   */
  async getAdminContacts(req, res, next) {
    try {
      const contacts = await contactsService.getContactsForAdmin();
      
      res.json({
        success: true,
        data: contacts,
        meta: {
          isAdmin: true,
          cache: false
        }
      });
      
    } catch (error) {
      logger.error('Error in getAdminContacts:', error);
      next(error);
    }
  }
  
  /**
   * Обновить контакты
   */
  async updateContacts(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.UnauthorizedError('Пользователь не авторизован');
      }
      
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
          cacheInvalidated: true,
          isAdmin: true
        }
      });
      
    } catch (error) {
      logger.error('Error in updateContacts:', error);
      next(error);
    }
  }
  
  /**
   * Переключить активность
   */
  async toggleActive(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.UnauthorizedError('Пользователь не авторизован');
      }
      
      const userId = req.user.id;
      
      const isActive = await contactsService.toggleActive(userId);
      
      logger.info(`User ${userId} toggled contacts active status to ${isActive}`);
      
      res.json({
        success: true,
        message: `Контакты ${isActive ? 'активированы' : 'деактивированы'}`,
        data: { 
          isActive
        },
        meta: {
          updatedBy: userId,
          isAdmin: true
        }
      });
      
    } catch (error) {
      logger.error('Error in toggleActive:', error);
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
        data: history,
        meta: {
          isAdmin: true
        }
      });
      
    } catch (error) {
      logger.error('Error in getChangeHistory:', error);
      next(error);
    }
  }
  
  /**
   * Экспорт в vCard
   */
  async exportVCard(req, res, next) {
    try {
      // Проверяем, является ли пользователь админом
      const isAdmin = (req.user && req.user.role && req.user.role.includes('admin')) || false;
      
      // Для экспорта vCard всегда используем только активные контакты
      const vCard = await contactsService.exportAsVCard(isAdmin);
      
      // Устанавливаем заголовки для скачивания
      res.set({
        'Content-Type': 'text/vcard',
        'Content-Disposition': 'attachment; filename="contacts.vcf"',
        'Content-Length': Buffer.byteLength(vCard, 'utf8')
      });
      
      res.send(vCard);
      
    } catch (error) {
      logger.error('Error in exportVCard:', error);
      
      // В случае ошибки возвращаем пустой vCard
      const emptyVCard = contactsService.generateEmptyVCard();
      res.set({
        'Content-Type': 'text/vcard',
        'Content-Disposition': 'attachment; filename="contacts.vcf"',
        'Content-Length': Buffer.byteLength(emptyVCard, 'utf8')
      });
      res.send(emptyVCard);
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
      logger.error('Health check failed:', error);
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