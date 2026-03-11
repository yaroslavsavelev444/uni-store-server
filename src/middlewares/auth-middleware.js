// middlewares/auth-middleware.js

import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { isSessionRevoked } from "../services/SessionService.js";
import {
  validateAccessToken,
  validateRefreshToken,
} from "../services/tokenService.js";
import { checkUserBlockStatus } from "../services/userSanctionService.js";

/**
 * Универсальная миддлвара для проверки авторизации
 *
 * @param {Object} options - Настройки миддлвары
 * @param {string[]} options.allowedRoles - Массив разрешённых ролей. Если ['all'], доступ разрешён всем.
 * @param {boolean} options.optional - Если true, проверка авторизации опциональна. По умолчанию false.
 * @returns {Function} Express middleware
 */
function authMiddleware(options = {}) {
  // Парсим параметры для обратной совместимости
  const parseOptions = (input) => {
    if (Array.isArray(input)) {
      return { allowedRoles: input, optional: false };
    }
    if (typeof input === "object") {
      return {
        allowedRoles: input.allowedRoles || [],
        optional: input.optional || false,
        checkBlock: input.checkBlock !== false, // По умолчанию проверяем блокировку
      };
    }
    return { allowedRoles: [], optional: false, checkBlock: true };
  };

  const { allowedRoles, optional, checkBlock } = parseOptions(options);

  return async (req, res, next) => {
    try {
      const authorizationHeader = req.headers.authorization;
      logger.debug("Authorization header:", authorizationHeader);

      // Если нет заголовка авторизации
      if (!authorizationHeader) {
        if (optional) {
          req.user = null;
          logger.debug(
            "Опциональный режим: заголовок авторизации отсутствует, user = null",
          );
          return next();
        } else {
          logger.warn(
            "Заголовок авторизации отсутствует (обязательная проверка)",
          );
          return next(ApiError.UnauthorizedError());
        }
      }

      // Извлекаем токен
      const tokenParts = authorizationHeader.split(" ");
      if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== "bearer") {
        if (optional) {
          req.user = null;
          logger.debug(
            "Опциональный режим: неверный формат заголовка, user = null",
          );
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
      const userData = await validateAccessToken(accessToken);
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
        let refreshToken = req.cookies?.refreshToken;

        if (!refreshToken && req.headers["refresh-token"]) {
          refreshToken = req.headers["refresh-token"];
          logger.debug(
            "Используем refresh token из заголовка (Safari fallback)",
          );
        }

        if (!refreshToken) {
          throw new Error("Refresh token не найден");
        }

        const refreshTokenData = await validateRefreshToken(refreshToken);

        if (!refreshTokenData || refreshTokenData.id !== userData.id) {
          throw new Error("Невалидный refresh token");
        }

        const isRevoked = await isSessionRevoked(refreshToken);
        if (isRevoked) {
          throw new Error("Refresh token отозван");
        }
      } catch (refreshTokenError) {
        if (optional) {
          req.user = null;
          logger.debug(
            "Опциональный режим: невалидный refresh token, user = null",
          );
          return next();
        } else {
          logger.warn("Невалидный refresh token:", refreshTokenError.message);
          return next(ApiError.UnauthorizedError());
        }
      }

      // 🔒 ПРОВЕРКА БЛОКИРОВКИ ПОЛЬЗОВАТЕЛЯ (если включена)
      if (checkBlock) {
        try {
          const blockStatus = await checkUserBlockStatus(userData.id);
          console.log("blockStatus", blockStatus);

          if (blockStatus.user.status === "blocked") {
            const blockedUntil = blockStatus.user.blockedUntil
              ? new Date(blockStatus.user.blockedUntil)
              : null;

            const now = new Date();
            let errorMessage = "Ваш аккаунт заблокирован";

            if (blockedUntil && blockedUntil > now) {
              if (isPermanentBlock(blockedUntil)) {
                errorMessage = "Ваш аккаунт заблокирован бессрочно";
              } else {
                const timeLeft = Math.ceil(
                  (blockedUntil.getTime() - now.getTime()) / (1000 * 60 * 60),
                );
                const days = Math.floor(timeLeft / 24);
                const hours = timeLeft % 24;

                let timeLeftStr = "";
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

            logger.warn(
              `Заблокированный пользователь ${userData.id} (${userData.email}) попытался получить доступ к ${req.method} ${req.path}`,
            );

            return next(
              ApiError.ForbiddenError(errorMessage, null, {
                blockDetails: {
                  status: "blocked",
                  blockedUntil: blockStatus.user.blockedUntil,
                  isPermanent: isPermanentBlock(blockedUntil),
                  activeSanctions: blockStatus.activeSanctions,
                },
              }),
            );
          }

          if (
            userData.status === "blocked" &&
            blockStatus.user.status === "active"
          ) {
            logger.info(
              `Пользователь ${userData.id} автоматически разблокирован (просроченная блокировка)`,
            );
            userData.status = "active";
            userData.blockedUntil = null;
          }
        } catch (blockCheckError) {
          logger.error(
            `Ошибка при проверке блокировки пользователя ${userData.id}:`,
            blockCheckError,
          );
        }
      }

      // Проверка роли
      if (
        allowedRoles &&
        allowedRoles.length > 0 &&
        !allowedRoles.includes("all")
      ) {
        if (!allowedRoles.includes(userData.role)) {
          logger.warn(
            `Пользователь ${userData.id} с ролью ${userData.role} не имеет доступа. Требуемые роли: ${allowedRoles.join(", ")}`,
          );

          if (optional) {
            req.user = null;
            logger.debug("Опциональный режим: роль не разрешена, user = null");
            return next();
          } else {
            return next(ApiError.ForbiddenError("Доступ запрещён"));
          }
        }
      }

      req.user = {
        ...userData,
        status: userData.status || "active",
        blockedUntil: userData.blockedUntil || null,
      };

      logger.info(
        `Пользователь ${userData.id} с ролью ${userData.role} прошёл проверку ${optional ? "(опционально)" : "(обязательно)"}`,
      );

      return next();
    } catch (e) {
      logger.error("Ошибка в универсальной миддлваре authMiddleware:", e);

      if (optional) {
        req.user = null;
        logger.debug("Опциональный режим: ошибка при проверке, user = null");
        return next();
      } else {
        return next(ApiError.UnauthorizedError());
      }
    }
  };
}

// Создаем специальную middleware для refresh
export function refreshMiddleware() {
  return async (req, res, next) => {
    try {
      let refreshToken = req.cookies?.refreshToken;

      if (!refreshToken && req.headers["refresh-token"]) {
        refreshToken = req.headers["refresh-token"];
        logger.debug(
          "Refresh: используем token из заголовка (Safari fallback)",
        );
      }

      if (!refreshToken) {
        logger.warn("Refresh token not provided for refresh endpoint");
        return next(ApiError.UnauthorizedError());
      }

      const userData = await validateRefreshToken(refreshToken);
      if (!userData) {
        logger.warn("Invalid refresh token for refresh endpoint");
        return next(ApiError.UnauthorizedError());
      }

      const isRevoked = await isSessionRevoked(refreshToken);
      if (isRevoked) {
        logger.warn("Refresh attempt with revoked token");
        return next(ApiError.UnauthorizedError());
      }

      try {
        const blockStatus = await checkUserBlockStatus(userData.id);

        if (blockStatus.user.status === "blocked") {
          logger.warn(
            `Заблокированный пользователь ${userData.id} пытается обновить токен`,
          );

          const blockedUntil = blockStatus.user.blockedUntil
            ? new Date(blockStatus.user.blockedUntil)
            : null;

          let errorMessage = "Аккаунт заблокирован";
          if (blockedUntil && !isPermanentBlock(blockedUntil)) {
            const now = new Date();
            if (blockedUntil > now) {
              errorMessage = `Аккаунт заблокирован до ${blockedUntil.toLocaleString("ru-RU")}`;
            }
          }

          return next(ApiError.ForbiddenError(errorMessage));
        }
      } catch (blockCheckError) {
        logger.error(
          `Ошибка при проверке блокировки для refresh ${userData.id}:`,
          blockCheckError,
        );
      }

      req.user = userData;
      next();
    } catch (e) {
      logger.error("Error in refresh middleware:", e);
      return next(ApiError.UnauthorizedError());
    }
  };
}

/**
 * Вспомогательные функции для форматирования времени
 */
function isPermanentBlock(blockedUntil) {
  if (!blockedUntil) return false;

  const tenYearsFromNow = new Date();
  tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);

  return blockedUntil > tenYearsFromNow;
}

function getDaysText(days) {
  if (days === 1) return "день";
  if (days >= 2 && days <= 4) return "дня";
  return "дней";
}

function getHoursText(hours) {
  if (hours === 1) return "час";
  if (hours >= 2 && hours <= 4) return "часа";
  return "часов";
}

/**
 * Вспомогательная функция для быстрого создания миддлвары с определенными ролями
 */
export function withRoles(allowedRoles = [], options = {}) {
  return authMiddleware({
    allowedRoles,
    optional: false,
    checkBlock: options.checkBlock !== false,
  });
}

/**
 * Вспомогательная функция для создания опциональной миддлвары
 */
export function optional(allowedRoles = [], options = {}) {
  return authMiddleware({
    allowedRoles,
    optional: true,
    checkBlock: options.checkBlock !== false,
  });
}

/**
 * Декоратор для маршрутов, требующих определенной роли
 */
export function requireRole(role, options = {}) {
  return authMiddleware({
    allowedRoles: [role],
    optional: false,
    checkBlock: options.checkBlock !== false,
  });
}

/**
 * Декоратор для маршрутов, доступных только аутентифицированным пользователям
 */
export function requireAuth(options = {}) {
  return authMiddleware({
    allowedRoles: ["all"],
    optional: false,
    checkBlock: options.checkBlock !== false,
  });
}

/**
 * Декоратор для опциональной проверки с любой ролью
 */
export function optionalAuth(options = {}) {
  return authMiddleware({
    allowedRoles: [],
    optional: true,
    checkBlock: options.checkBlock !== false,
  });
}

/**
 * Специальная миддлвара для отключения проверки блокировки
 * (например, для endpoints, которые должны быть доступны даже заблокированным пользователям)
 */
export function withoutBlockCheck(options = {}) {
  const baseOptions = typeof options === "object" ? options : {};
  return authMiddleware({
    ...baseOptions,
    checkBlock: false,
  });
}

/**
 * Миддлвара только для проверки блокировки (без проверки ролей)
 */
export function blockCheckOnly() {
  return async (req, res, next) => {
    if (!req.user || !req.user.id) {
      return next();
    }

    try {
      const blockStatus = await checkUserBlockStatus(req.user.id);

      if (blockStatus.user.status === "blocked") {
        const blockedUntil = blockStatus.user.blockedUntil
          ? new Date(blockStatus.user.blockedUntil)
          : null;

        let errorMessage = "Ваш аккаунт заблокирован";

        if (blockedUntil && !isPermanentBlock(blockedUntil)) {
          const now = new Date();
          if (blockedUntil > now) {
            const timeLeft = Math.ceil(
              (blockedUntil.getTime() - now.getTime()) / (1000 * 60 * 60),
            );
            errorMessage = `Ваш аккаунт заблокирован. Доступ будет восстановлен через ${timeLeft} ${getHoursText(timeLeft)}`;
          }
        }

        return next(ApiError.ForbiddenError(errorMessage));
      }

      next();
    } catch (error) {
      logger.error(
        `Ошибка при проверке блокировки в blockCheckOnly: ${error.message}`,
      );
      next();
    }
  };
}

export default authMiddleware;
