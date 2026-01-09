const tokenService = require("../services/tokenService");
const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
const SessionService = require("../services/SessionService");

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
        optional: input.optional || false
      };
    }
    return { allowedRoles: [], optional: false };
  };

  const { allowedRoles, optional } = parseOptions(options);

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

      // Устанавливаем пользователя в запрос
      req.user = userData;
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

      req.user = userData;
      next();
    } catch (e) {
      logger.error("Error in refresh middleware:", e);
      console.error(e);
      return next(ApiError.UnauthorizedError());
    }
  };
};

/**
 * Вспомогательная функция для быстрого создания миддлвары с определенными ролями
 * (сохраняем обратную совместимость со старым кодом)
 */
module.exports.withRoles = function (allowedRoles = []) {
  return module.exports({ allowedRoles, optional: false });
};

/**
 * Вспомогательная функция для создания опциональной миддлвары
 */
module.exports.optional = function (allowedRoles = []) {
  return module.exports({ allowedRoles, optional: true });
};

/**
 * Декоратор для маршрутов, требующих определенной роли
 * (удобно для использования с роутерами)
 */
module.exports.requireRole = function (role) {
  return module.exports({ allowedRoles: [role], optional: false });
};

/**
 * Декоратор для маршрутов, доступных только аутентифицированным пользователям
 * (любая роль, кроме null)
 */
module.exports.requireAuth = function () {
  return module.exports({ allowedRoles: ['all'], optional: false });
};

/**
 * Декоратор для опциональной проверки с любой ролью
 */
module.exports.optionalAuth = function () {
  return module.exports({ allowedRoles: [], optional: true });
};