// server/middleware/deviceAuthMiddleware.js
const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
const { UserModel } = require("../models/index.models");

// Политики доступа для разных ролей (такие же как в deviceAccessMiddleware)
const ROLE_ACCESS_POLICIES = {
  admin: {
    allowedPlatforms: ['web'],
    message: 'Администраторам доступ разрешен только через веб-интерфейс'
  },
  user: {
    allowedPlatforms: ['web', 'mobile'],
    message: 'Доступ разрешен'
  }
};

class DeviceAuthManager {
  static extractDeviceInfo(req) {
    return {
      platform: req.headers['x-device-platform'] || 'unknown',
      deviceId: req.headers['x-device-id'],
      appVersion: req.headers['x-app-version'],
      userAgent: req.headers['x-user-agent'] || req.headers['user-agent'],
      timestamp: req.headers['x-timestamp']
    };
  }

  static validateDeviceAccess(userRole, devicePlatform) {
    const policy = ROLE_ACCESS_POLICIES[userRole];
    
    if (!policy) {
      logger.warn(`No access policy defined for role: ${userRole}`);
      return { 
        allowed: false, 
        message: 'Не определена политика доступа для вашей роли' 
      };
    }

    const isAllowed = policy.allowedPlatforms.includes(devicePlatform);
    
    return {
      allowed: isAllowed,
      message: isAllowed ? policy.message : `Доступ запрещен: ${policy.message}`,
      requiredPlatforms: policy.allowedPlatforms,
      currentPlatform: devicePlatform
    };
  }

  /**
   * Миддлвара для проверки доступа по устройству ДО аутентификации
   * Используется на эндпоинтах login/register
   */
  static createAuthMiddleware() {
    return async function deviceAuthMiddleware(req, res, next) {
      try {
        const deviceInfo = this.extractDeviceInfo(req);
        const { email } = req.body;

        // Для логина - проверяем существующего пользователя
        if (req.path.includes('/login') && email) {
          await this.checkExistingUserAccess(email, deviceInfo);
        }

        // Для регистрации - проверяем или предполагаемую роль
        if (req.path.includes('/register')) {
          await this.checkRegistrationAccess(email, deviceInfo);
        }

        // Добавляем информацию об устройстве в request для дальнейшего использования
        req.device = deviceInfo;
        next();
      } catch (error) {
        logger.error("Error in device auth middleware:", error);
        next(error);
      }
    }.bind(this);
  }

  /**
   * Проверка доступа для существующего пользователя при логине
   */
  static async checkExistingUserAccess(email, deviceInfo) {
    try {
      const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
      
      if (!user) {
        // Если пользователь не найден, пропускаем - будет ошибка в контроллере
        return;
      }

      const accessCheck = this.validateDeviceAccess(user.role, deviceInfo.platform);
      
      if (!accessCheck.allowed) {
        logger.warn(
          `Login attempt denied for user ${user._id} (${user.role}) ` +
          `from platform ${deviceInfo.platform}`
        );
        
        throw ApiError.ForbiddenError(
          accessCheck.message,
          'DEVICE_ACCESS_DENIED',
          { 
            requiredPlatforms: accessCheck.requiredPlatforms,
            currentPlatform: accessCheck.currentPlatform,
            userId: user._id,
            userRole: user.role
          }
        );
      }

      logger.info(
        `Login allowed for user ${user._id} (${user.role}) from ${deviceInfo.platform}`
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Если ошибка БД - логируем, но пропускаем запрос дальше
      logger.error('Error checking user access:', error);
    }
  }

  /**
   * Проверка доступа при регистрации
   */
  static async checkRegistrationAccess(email, deviceInfo) {
    // Если  - регистрируется юрист (только с веба)
    if (deviceInfo.platform !== 'web') {
      const accessCheck = this.validateDeviceAccess('lawyer', deviceInfo.platform);
      
      if (!accessCheck.allowed) {
        logger.warn(
          `Lawyer registration attempt denied from platform ${deviceInfo.platform}`
        );
        
        throw ApiError.ForbiddenError(
          accessCheck.message,
          'DEVICE_ACCESS_DENIED',
          { 
            requiredPlatforms: accessCheck.requiredPlatforms,
            currentPlatform: accessCheck.currentPlatform,
            userRole: 'lawyer'
          }
        );
      }
    }

    // Для обычной регистрации разрешаем все платформы
    logger.info(`Registration attempt from ${deviceInfo.platform}`);
  }

  /**
   * Миддлвара для проверки после аутентификации (используется в контроллерах)
   */
  static checkPostAuthAccess(user, deviceInfo) {
    const accessCheck = this.validateDeviceAccess(user.role, deviceInfo.platform);
    
    if (!accessCheck.allowed) {
      logger.warn(
        `Post-auth access denied for user ${user._id} (${user.role}) ` +
        `from platform ${deviceInfo.platform}`
      );
      
      throw ApiError.ForbiddenError(
        accessCheck.message,
        'DEVICE_ACCESS_DENIED',
        { 
          requiredPlatforms: accessCheck.requiredPlatforms,
          currentPlatform: accessCheck.currentPlatform 
        }
      );
    }
  }
}

module.exports = DeviceAuthManager;