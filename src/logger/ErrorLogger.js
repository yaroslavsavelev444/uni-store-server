
const getIp = require('../utils/getIp');
const auditLogger = require('./auditLogger');
const logger = require('./logger');

class ErrorLogger {
  /**
   * Логирование ошибки API с контекстом запроса
   */
  static logApiError(error, req, errorType = 'API_ERROR') {
    try {
      const context = this.getRequestContext(req);
      const errorData = this.getErrorData(error, errorType);
      
      // 1. В консоль (для разработки)
      logger.error({
        ...errorData,
        ...context,
        stack: error.stack
      });
      
      // 2. В файл ошибок через auditLogger
      auditLogger.loggers.error.error({
        ...errorData,
        ...context,
        errorType,
        stack: this.sanitizeStack(error.stack)
      });
      
      // 3. Если это ошибка пользователя - логируем как USER_ACTION_FAILED
      if (req && req.user && error.status >= 400 && error.status < 500) {
        const event = this.mapStatusCodeToEvent(error.status);
        auditLogger.logUserEvent(
          req.user.id,
          req.user.email,
          event,
          `${errorType}_FAILED`,
          {
            ip: context.ip,
            endpoint: context.endpoint,
            method: context.method,
            error: error.message,
            statusCode: error.status
          }
        );
      }
      
      // 4. Если это ошибка админа
      if (req && req.user && req.user.role !== 'user') {
        auditLogger.logAdminEvent(
          req.user.id || 'system',
          req.user.email || 'system@error',
          req.user.role || 'system',
          'SYSTEM_ERROR',
          errorType,
          null,
          [],
          `API Error: ${error.message}`
        );
      }
      
    } catch (logError) {
      // Fallback на простой console.error если логирование сломалось
      console.error('❌ Ошибка при логировании ошибки:', logError.message || logError);
      console.error('Original error:', error.message || error);
      
      // Пытаемся залогировать хотя бы минимальную информацию
      if (error && error.message) {
        console.error(`Error Type: ${errorType}`);
        console.error(`Error Message: ${error.message}`);
        console.error(`Error Stack: ${error.stack || 'No stack'}`);
      }
    }
  }
  
  /**
   * Логирование непредвиденных ошибок (500)
   */
  static logUnexpectedError(error, req) {
    try {
      const context = this.getRequestContext(req);
      
      // Детальное логирование в консоль
      logger.error({
        message: 'UNEXPECTED_ERROR',
        error: error.message,
        stack: error.stack,
        ...context
      });
      
      // В файл ошибок
      auditLogger.loggers.error.error({
        event: 'UNEXPECTED_ERROR',
        error: error.message,
        stack: this.sanitizeStack(error.stack),
        ...context,
        severity: 'CRITICAL'
      });
      
      // Также отправляем уведомление админам (можно добавить позже)
      if (process.env.NODE_ENV === 'production') {
        this.notifyAdmins({
          type: 'UNEXPECTED_ERROR',
          error: error.message,
          endpoint: context.endpoint,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (logError) {
      console.error('CRITICAL: Ошибка логирования сломалась:', logError.message || logError);
      console.error('Original critical error:', error.message || error);
      
      // Крайний fallback - просто выводим сообщение об ошибке
      console.error('Error occurred:', {
        message: error?.message,
        name: error?.name,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Логирование валидационных ошибок
   */
  static logValidationError(errors, req) {
    try {
      const context = this.getRequestContext(req);
      
      logger.warn({
        event: 'VALIDATION_ERROR',
        errors: errors,
        ...context
      });
      
      if (req && req.user) {
        auditLogger.logUserEvent(
          req.user.id,
          req.user.email,
          'VALIDATION',
          'VALIDATION_FAILED',
          {
            ip: context.ip,
            endpoint: context.endpoint,
            validationErrors: errors.map(e => ({
              field: e.field || 'unknown',
              message: e.message
            }))
          }
        );
      }
    } catch (logError) {
      console.error('Ошибка при логировании валидационной ошибки:', logError.message || logError);
      console.error('Validation errors:', errors);
    }
  }
  
  /**
   * Получение контекста запроса (с защитой от null)
   */
  static getRequestContext(req) {
    // Если req null или undefined
    if (!req) {
      return {
        ip: 'unknown',
        endpoint: 'unknown',
        method: 'unknown',
        userAgent: 'unknown',
        userId: 'anonymous',
        userRole: 'guest',
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
        error: 'Request object is null or undefined'
      };
    }
    
    try {
      return {
        ip: getIp(req) || 'unknown',
        endpoint: req.originalUrl || req.url || 'unknown',
        method: req.method || 'unknown',
        userAgent: req.headers && req.headers['user-agent'] ? req.headers['user-agent'] : 'unknown',
        userId: req.user && req.user.id ? req.user.id : 'anonymous',
        userRole: req.user && req.user.role ? req.user.role : 'guest',
        query: req.query && Object.keys(req.query).length > 0 ? req.query : undefined,
        params: req.params && Object.keys(req.params).length > 0 ? req.params : undefined,
        body: req.body && Object.keys(req.body).length > 0 
          ? this.sanitizeBody(req.body) 
          : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.id || this.generateRequestId()
      };
    } catch (error) {
      // Если произошла ошибка при получении контекста
      return {
        ip: 'unknown',
        endpoint: 'error_getting_endpoint',
        method: 'unknown',
        userAgent: 'unknown',
        userId: 'anonymous',
        userRole: 'guest',
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
        errorInContext: error.message || 'Failed to get request context'
      };
    }
  }
  
  /**
   * Очистка чувствительных данных из body
   */
  static sanitizeBody(body) {
    if (!body || typeof body !== 'object') {
      return body;
    }
    
    try {
      const sanitized = { ...body };
      const sensitiveFields = [
        'password', 'newPassword', 'oldPassword', 'token', 
        'refreshToken', 'accessToken', 'secret', 'apiKey',
        'creditCard', 'cvv', 'ssn', 'cardNumber', 'expiryDate'
      ];
      
      sensitiveFields.forEach(field => {
        if (sanitized[field] !== undefined && sanitized[field] !== null) {
          sanitized[field] = '***REDACTED***';
        }
      });
      
      return sanitized;
    } catch (error) {
      return { error: 'Failed to sanitize body' };
    }
  }
  
  /**
   * Очистка stack trace (убираем чувствительные пути)
   */
  static sanitizeStack(stack) {
    if (!stack || typeof stack !== 'string') {
      return null;
    }
    
    try {
      // Убираем полные пути к файлам в контейнере
      return stack
        .split('\n')
        .map(line => line.replace(/\/app\/src\//g, '~/'))
        .join('\n')
        .substring(0, 2000); // Ограничиваем длину
    } catch (error) {
      return stack;
    }
  }
  
  /**
   * Маппинг кодов ошибок на события
   */
  static mapStatusCodeToEvent(statusCode) {
    const map = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMIT',
      500: 'SERVER_ERROR'
    };
    
    return map[statusCode] || 'UNKNOWN_ERROR';
  }
  
  static getErrorData(error, errorType) {
    if (!error) {
      return {
        errorType,
        message: 'No error object provided',
        statusCode: 500,
        errors: [],
        name: 'UnknownError'
      };
    }
    
    return {
      errorType,
      message: error.message || 'Unknown error',
      statusCode: error.status || error.statusCode || 500,
      errors: error.errors || [],
      name: error.name || 'Error'
    };
  }
  
  static generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  static notifyAdmins(data) {
    // Здесь можно добавить интеграцию с:
    // - Slack/Telegram ботом
    // - Sentry
    // - Email уведомлениями
    // Пока просто логируем
    console.log('📢 Admin notification:', {
      type: data.type,
      error: data.error,
      timestamp: data.timestamp,
      notificationTime: new Date().toISOString()
    });
  }
  
  /**
   * Безопасное логирование ошибки (универсальный метод)
   */
  static safeLogError(error, context = {}) {
    try {
      const errorInfo = {
        message: error?.message || 'Unknown error',
        name: error?.name || 'Error',
        stack: error?.stack || 'No stack trace',
        ...context,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      };
      
      // Логируем в консоль
      console.error('🔴 Error:', errorInfo);
      
      // Если есть аудит логгер, логируем и туда
      if (auditLogger && auditLogger.loggers && auditLogger.loggers.error) {
        auditLogger.loggers.error.error(errorInfo);
      }
      
    } catch (logError) {
      // Абсолютный fallback
      console.error('FATAL: Error logging completely broken');
      console.error('Original error:', error);
      console.error('Logging error:', logError);
    }
  }
}

module.exports = ErrorLogger;