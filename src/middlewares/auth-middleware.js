// middlewares/auth-middleware.js
const tokenService = require("../services/tokenService");
const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
const SessionService = require("../services/SessionService");
const UserSanctionService = require("../services/userSanctionService");

/**
 * Универсальная миддлвара для проверки авторизации
 * 
 * @param {Object} options - Настройки миддлвары
 * @param {string[]} options.allowedRoles - Массив разрешённых ролей. Если ['all'], доступ разрешён всем.
 * @param {boolean} options.optional - Если true, проверка авторизации опциональна. По умолчанию false.
 * @returns {Function} Express middleware
 */
module.exports = function (options = {}) {
  // Парсим параметры для обратной совместимости
  const parseOptions = (input) => {
    if (Array.isArray(input)) {
      return { allowedRoles: input, optional: false };
    }
    if (typeof input === 'object') {
      return {
        allowedRoles: input.allowedRoles || [],
        optional: input.optional || false,
        checkBlock: input.checkBlock !== false // По умолчанию проверяем блокировку
      };
    }
    return { allowedRoles: [], optional: false, checkBlock: true };
  };

  const { allowedRoles, optional, checkBlock } = parseOptions(options);

  return async function (req, res, next) {
    try {
      const authorizationHeader = req.headers.authorization;
      logger.debug("Authorization header:", authorizationHeader);

      // Если нет заголовка авторизации
      if (!authorizationHeader) {
        if (optional) {
          // Опциональный режим: продолжаем без пользователя
          req.user = null;
          logger.debug("Опциональный режим: заголовок авторизации отсутствует, user = null");
          return next();
        } else {
          // Обязательный режим: возвращаем ошибку
          logger.warn("Заголовок авторизации отсутствует (обязательная проверка)");
          return next(ApiError.UnauthorizedError());
        }
      }

      // Извлекаем токен
      const tokenParts = authorizationHeader.split(' ');
      if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== 'bearer') {
        if (optional) {
          req.user = null;
          logger.debug("Опциональный режим: неверный формат заголовка, user = null");
          return next();
        } else {
          logger.warn("Неверный формат заголовка авторизации");
          return next(ApiError.UnauthorizedError());
        }
      }

      const accessToken = tokenParts[1];
      if (!accessToken) {
        if (optional) {
          req.user = null;
          logger.debug("Опциональный режим: токен отсутствует, user = null");
          return next();
        } else {
          logger.warn("Токен отсутствует");
          return next(ApiError.UnauthorizedError());
        }
      }

      // Валидируем access token
      const userData = await tokenService.validateAccessToken(accessToken);
      if (!userData) {
        if (optional) {
          req.user = null;
          logger.debug("Опциональный режим: невалидный токен, user = null");
          return next();
        } else {
          logger.warn("Невалидный access token");
          return next(ApiError.UnauthorizedError());
        }
      }

      // 🔐 ВСЕГДА ПРОВЕРЯЕМ REFRESH TOKEN НА ОТЗЫВ (только если пользователь найден)
      try {
        // Получаем refresh token из cookies или заголовков (fallback для Safari)
        let refreshToken = req.cookies?.refreshToken;
        
        // Fallback для Safari: если нет в cookies, проверяем заголовок
        if (!refreshToken && req.headers["refresh-token"]) {
          refreshToken = req.headers["refresh-token"];
          logger.debug("Используем refresh token из заголовка (Safari fallback)");
        }

        if (!refreshToken) {
          throw new Error("Refresh token не найден");
        }

        // Проверяем, что refresh token принадлежит этому пользователю
        const refreshTokenData = await tokenService.validateRefreshToken(refreshToken);
        
        if (!refreshTokenData || refreshTokenData.id !== userData.id) {
          throw new Error("Невалидный refresh token");
        }

        // Проверяем, не отозван ли токен
        const isRevoked = await SessionService.isSessionRevoked(refreshToken);
        if (isRevoked) {
          throw new Error("Refresh token отозван");
        }

      } catch (refreshTokenError) {
        if (optional) {
          req.user = null;
          logger.debug("Опциональный режим: невалидный refresh token, user = null");
          return next();
        } else {
          logger.warn("Невалидный refresh token:", refreshTokenError.message);
          return next(ApiError.UnauthorizedError());
        }
      }

      // 🔒 ПРОВЕРКА БЛОКИРОВКИ ПОЛЬЗОВАТЕЛЯ (если включена)
      if (checkBlock) {
        try {
          const blockStatus = await UserSanctionService.checkUserBlockStatus(userData.id);
          console.log('blockStatus' , blockStatus);
          
          // Проверяем, заблокирован ли пользователь
          if (blockStatus.user.status === 'blocked') {
            const blockedUntil = blockStatus.user.blockedUntil 
              ? new Date(blockStatus.user.blockedUntil)
              : null;
            
            const now = new Date();
            let errorMessage = 'Ваш аккаунт заблокирован';
            
            // Формируем детальное сообщение
            if (blockedUntil && blockedUntil > now) {
              if (isPermanentBlock(blockedUntil)) {
                errorMessage = 'Ваш аккаунт заблокирован бессрочно';
              } else {
                const timeLeft = Math.ceil((blockedUntil.getTime() - now.getTime()) / (1000 * 60 * 60));
                const days = Math.floor(timeLeft / 24);
                const hours = timeLeft % 24;
                
                let timeLeftStr = '';
                if (days > 0) {
                  timeLeftStr += `${days} ${getDaysText(days)}`;
                  if (hours > 0) {
                    timeLeftStr += ` ${hours} ${getHoursText(hours)}`;
                  }
                } else {
                  timeLeftStr = `${hours} ${getHoursText(hours)}`;
                }
                
                errorMessage = `Ваш аккаунт заблокирован. Доступ будет восстановлен через ${timeLeftStr}`;
              }
            }
            
            // Логируем попытку доступа заблокированного пользователя
            logger.warn(
              `Заблокированный пользователь ${userData.id} (${userData.email}) попытался получить доступ к ${req.method} ${req.path}`
            );
            
            return next(ApiError.ForbiddenError(errorMessage, null, {
              blockDetails: {
                status: 'blocked',
                blockedUntil: blockStatus.user.blockedUntil,
                isPermanent: isPermanentBlock(blockedUntil),
                activeSanctions: blockStatus.activeSanctions,
              }
            }));
          }
          
          // Если пользователь был разблокирован автоматически (просроченная блокировка)
          if (userData.status === 'blocked' && blockStatus.user.status === 'active') {
            logger.info(`Пользователь ${userData.id} автоматически разблокирован (просроченная блокировка)`);
            // Обновляем статус в userData для дальнейшего использования
            userData.status = 'active';
            userData.blockedUntil = null;
          }
          
        } catch (blockCheckError) {
          // Если не удалось проверить статус блокировки, логируем и продолжаем
          logger.error(`Ошибка при проверке блокировки пользователя ${userData.id}:`, blockCheckError);
          // В случае ошибки не блокируем доступ, но логируем
        }
      }

      // Проверка роли (если заданы allowedRoles)
      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes('all')) {
        if (!allowedRoles.includes(userData.role)) {
          logger.warn(
            `Пользователь ${userData.id} с ролью ${userData.role} не имеет доступа. Требуемые роли: ${allowedRoles.join(', ')}`
          );
          
          if (optional) {
            // В опциональном режиме просто не устанавливаем пользователя
            req.user = null;
            logger.debug("Опциональный режим: роль не разрешена, user = null");
            return next();
          } else {
            return next(ApiError.ForbiddenError("Доступ запрещён"));
          }
        }
      }

      // Устанавливаем пользователя в запрос (добавляем статус блокировки)
      req.user = {
        ...userData,
        status: userData.status || 'active',
        blockedUntil: userData.blockedUntil || null
      };
      
      logger.info(
        `Пользователь ${userData.id} с ролью ${userData.role} прошёл проверку ${optional ? '(опционально)' : '(обязательно)'}`
      );
      
      return next();

    } catch (e) {
      logger.error("Ошибка в универсальной миддлваре authMiddleware:", e);
      
      if (optional) {
        // В опциональном режиме при ошибке продолжаем без пользователя
        req.user = null;
        logger.debug("Опциональный режим: ошибка при проверке, user = null");
        return next();
      } else {
        return next(ApiError.UnauthorizedError());
      }
    }
  };
};

// Создаем специальную middleware для refresh
module.exports.refreshMiddleware = function () {
  return async function (req, res, next) {
    try {
      // Для refresh endpoint мы проверяем refresh token из cookies или заголовков (fallback для Safari)
      let refreshToken = req.cookies?.refreshToken;
      
      // Fallback для Safari
      if (!refreshToken && req.headers['refresh-token']) {
        refreshToken = req.headers['refresh-token'];
        logger.debug("Refresh: используем token из заголовка (Safari fallback)");
      }
      
      if (!refreshToken) {
        logger.warn("Refresh token not provided for refresh endpoint");
        return next(ApiError.UnauthorizedError());
      }

      // Валидируем refresh token
      const userData = await tokenService.validateRefreshToken(refreshToken);
      if (!userData) {
        logger.warn("Invalid refresh token for refresh endpoint");
        return next(ApiError.UnauthorizedError());
      }

      // Проверяем, не отозван ли токен
      const isRevoked = await SessionService.isSessionRevoked(refreshToken);
      if (isRevoked) {
        logger.warn("Refresh attempt with revoked token");
        return next(ApiError.UnauthorizedError());
      }

      // 🔒 ПРОВЕРКА БЛОКИРОВКИ ПОЛЬЗОВАТЕЛЯ ДЛЯ REFRESH
      try {
        const blockStatus = await UserSanctionService.checkUserBlockStatus(userData.id);
        
        if (blockStatus.user.status === 'blocked') {
          logger.warn(`Заблокированный пользователь ${userData.id} пытается обновить токен`);
          
          // Для refresh endpoint возвращаем более подробную ошибку
          const blockedUntil = blockStatus.user.blockedUntil 
            ? new Date(blockStatus.user.blockedUntil)
            : null;
          
          let errorMessage = 'Аккаунт заблокирован';
          if (blockedUntil && !isPermanentBlock(blockedUntil)) {
            const now = new Date();
            if (blockedUntil > now) {
              errorMessage = `Аккаунт заблокирован до ${blockedUntil.toLocaleString('ru-RU')}`;
            }
          }
          
          return next(ApiError.ForbiddenError(errorMessage));
        }
        
      } catch (blockCheckError) {
        logger.error(`Ошибка при проверке блокировки для refresh ${userData.id}:`, blockCheckError);
        // В случае ошибки продолжаем
      }

      req.user = userData;
      next();
    } catch (e) {
      logger.error("Error in refresh middleware:", e);
      return next(ApiError.UnauthorizedError());
    }
  };
};

/**
 * Вспомогательные функции для форматирования времени
 */
function isPermanentBlock(blockedUntil) {
  if (!blockedUntil) return false;
  
  // Если блокировка более чем на 10 лет, считаем ее постоянной
  const tenYearsFromNow = new Date();
  tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
  
  return blockedUntil > tenYearsFromNow;
}

function getDaysText(days) {
  if (days === 1) return 'день';
  if (days >= 2 && days <= 4) return 'дня';
  return 'дней';
}

function getHoursText(hours) {
  if (hours === 1) return 'час';
  if (hours >= 2 && hours <= 4) return 'часа';
  return 'часов';
}

/**
 * Вспомогательная функция для быстрого создания миддлвары с определенными ролями
 */
module.exports.withRoles = function (allowedRoles = [], options = {}) {
  return module.exports({ 
    allowedRoles, 
    optional: false,
    checkBlock: options.checkBlock !== false
  });
};

/**
 * Вспомогательная функция для создания опциональной миддлвары
 */
module.exports.optional = function (allowedRoles = [], options = {}) {
  return module.exports({ 
    allowedRoles, 
    optional: true,
    checkBlock: options.checkBlock !== false
  });
};

/**
 * Декоратор для маршрутов, требующих определенной роли
 */
module.exports.requireRole = function (role, options = {}) {
  return module.exports({ 
    allowedRoles: [role], 
    optional: false,
    checkBlock: options.checkBlock !== false
  });
};

/**
 * Декоратор для маршрутов, доступных только аутентифицированным пользователям
 */
module.exports.requireAuth = function (options = {}) {
  return module.exports({ 
    allowedRoles: ['all'], 
    optional: false,
    checkBlock: options.checkBlock !== false
  });
};

/**
 * Декоратор для опциональной проверки с любой ролью
 */
module.exports.optionalAuth = function (options = {}) {
  return module.exports({ 
    allowedRoles: [], 
    optional: true,
    checkBlock: options.checkBlock !== false
  });
};

/**
 * Специальная миддлвара для отключения проверки блокировки
 * (например, для endpoints, которые должны быть доступны даже заблокированным пользователям)
 */
module.exports.withoutBlockCheck = function (options = {}) {
  const baseOptions = typeof options === 'object' ? options : {};
  return module.exports({
    ...baseOptions,
    checkBlock: false
  });
};

/**
 * Миддлвара только для проверки блокировки (без проверки ролей)
 */
module.exports.blockCheckOnly = function () {
  return async function (req, res, next) {
    if (!req.user || !req.user.id) {
      return next();
    }
    
    try {
      const blockStatus = await UserSanctionService.checkUserBlockStatus(req.user.id);
      
      if (blockStatus.user.status === 'blocked') {
        const blockedUntil = blockStatus.user.blockedUntil 
          ? new Date(blockStatus.user.blockedUntil)
          : null;
        
        let errorMessage = 'Ваш аккаунт заблокирован';
        
        if (blockedUntil && !isPermanentBlock(blockedUntil)) {
          const now = new Date();
          if (blockedUntil > now) {
            const timeLeft = Math.ceil((blockedUntil.getTime() - now.getTime()) / (1000 * 60 * 60));
            errorMessage = `Ваш аккаунт заблокирован. Доступ будет восстановлен через ${timeLeft} ${getHoursText(timeLeft)}`;
          }
        }
        
        return next(ApiError.ForbiddenError(errorMessage));
      }
      
      next();
    } catch (error) {
      logger.error(`Ошибка при проверке блокировки в blockCheckOnly: ${error.message}`);
      next(); // В случае ошибки разрешаем доступ
    }
  };
};