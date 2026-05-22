// middlewares/auth-middleware.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import SessionService from "../services/SessionService.js";
import {
  validateAccessToken,
  validateRefreshToken,
  validateRefreshTokenFromRequest,
} from "../services/tokenService.js";
import UserSanctionService from "../services/userSanctionService.js";
import type {
  AuthMiddlewareOptions,
  AuthRequest,
  AuthUser,
  OptionalAuthRequest,
  RequestWithCookies,
} from "../types/auth.js";

/**
 * Проверяет, является ли блокировка бессрочной (больше 10 лет)
 */
function isPermanentBlock(blockedUntil: Date | null): boolean {
  if (!blockedUntil) return false;
  const tenYearsFromNow = new Date();
  tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
  return blockedUntil > tenYearsFromNow;
}

/**
 * Форматирует сообщение о блокировке в зависимости от оставшегося времени
 */
export function formatBlockMessage(blockedUntil: Date | null): string {
  if (!blockedUntil) return "Ваш аккаунт заблокирован";

  const now = new Date();
  if (blockedUntil <= now) return "Ваш аккаунт заблокирован";

  if (isPermanentBlock(blockedUntil)) {
    return "Ваш аккаунт заблокирован бессрочно";
  }

  const timeLeftMs = blockedUntil.getTime() - now.getTime();
  const hoursLeft = Math.ceil(timeLeftMs / (1000 * 60 * 60));
  const daysLeft = Math.floor(hoursLeft / 24);
  const remainingHours = hoursLeft % 24;

  let timeStr = "";
  if (daysLeft > 0) {
    timeStr += `${daysLeft} ${getDaysText(daysLeft)}`;
    if (remainingHours > 0) {
      timeStr += ` ${remainingHours} ${getHoursText(remainingHours)}`;
    }
  } else {
    timeStr = `${hoursLeft} ${getHoursText(hoursLeft)}`;
  }

  return `Ваш аккаунт заблокирован. Доступ будет восстановлен через ${timeStr}`;
}

function getDaysText(days: number): string {
  if (days === 1) return "день";
  if (days >= 2 && days <= 4) return "дня";
  return "дней";
}

function getHoursText(hours: number): string {
  if (hours === 1) return "час";
  if (hours >= 2 && hours <= 4) return "часа";
  return "часов";
}

/**
 * Универсальная миддлвара для проверки авторизации
 *
 * @param options - Настройки миддлвары
 * @returns Express middleware
 */
const authMiddleware = (options: AuthMiddlewareOptions | string[] = {}) => {
  // Парсим параметры для обратной совместимости
  const parseOptions = (
    input: AuthMiddlewareOptions | string[],
  ): AuthMiddlewareOptions => {
    if (Array.isArray(input)) {
      return { allowedRoles: input, optional: false, checkBlock: true };
    }
    if (typeof input === "object") {
      return {
        allowedRoles: input.allowedRoles || [],
        optional: input.optional || false,
        checkBlock: input.checkBlock !== false, // по умолчанию true
      };
    }
    return { allowedRoles: [], optional: false, checkBlock: true };
  };
  const { allowedRoles, optional, checkBlock } = parseOptions(options);

  return async (
    req: AuthRequest | OptionalAuthRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authorizationHeader = req.headers?.authorization;

      if (!authorizationHeader) {
        if (optional) {
          (req as OptionalAuthRequest).user = null;
          return next();
        } else {
          return next(ApiError.UnauthorizedError());
        }
      }

      const tokenParts = authorizationHeader.split(" ");
      if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== "bearer") {
        if (optional) {
          (req as OptionalAuthRequest).user = null;
          return next();
        } else {
          return next(ApiError.UnauthorizedError());
        }
      }
      const accessToken = tokenParts[1];

      if (!accessToken) {
        if (optional) {
          (req as OptionalAuthRequest).user = null;
          return next();
        } else {
          return next(ApiError.UnauthorizedError());
        }
      }

      const userData = validateAccessToken(accessToken) as AuthUser | null;

      if (!userData) {
        if (optional) {
          (req as OptionalAuthRequest).user = null;
          return next();
        } else {
          return next(ApiError.UnauthorizedError());
        }
      }

      // Проверка refresh token (только если есть userData)
      // try {
      //   const refreshRequest = {
      //     cookies: (req as RequestWithCookies).cookies,
      //     headers: req.headers,
      //     body: req.body,
      //   };
      //   await validateRefreshTokenFromRequest(refreshRequest as any, userData);
      // } catch (refreshTokenError) {
      //   if (optional) {
      //     (req as OptionalAuthRequest).user = null;
      //     return next();
      //   } else {
      //     return next(ApiError.UnauthorizedError());
      //   }
      // }

      // 🔒 ПРОВЕРКА БЛОКИРОВКИ ПОЛЬЗОВАТЕЛЯ (если включена)
      if (checkBlock) {
        try {
          const blockStatus = await UserSanctionService.checkUserBlockStatus(
            userData.id,
          );

          // Проверяем, заблокирован ли пользователь
          if (blockStatus.user.status === "blocked") {
            const blockedUntil = blockStatus.user.blockedUntil
              ? new Date(blockStatus.user.blockedUntil)
              : null;

            const errorMessage = formatBlockMessage(blockedUntil);
            return next(ApiError.ForbiddenError(errorMessage, undefined));
          }

          // Если пользователь был разблокирован автоматически (просроченная блокировка)
          if (
            userData.status === "blocked" &&
            blockStatus.user.status === "active"
          ) {
            // Обновляем статус в userData для дальнейшего использования
            userData.status = "active";
            userData.blockedUntil = null;
          }
        } catch (blockCheckError) {
          // В случае ошибки не блокируем доступ, но логируем (логирование убрано по требованию)
        }
      }

      if (
        allowedRoles &&
        allowedRoles.length > 0 &&
        !allowedRoles.includes("all")
      ) {
        if (!allowedRoles.includes(userData.role)) {
          if (optional) {
            (req as OptionalAuthRequest).user = null;
            return next();
          } else {
            return next(ApiError.ForbiddenError("Доступ запрещён"));
          }
        }
      }

      // Устанавливаем пользователя в запрос, добавляя статус и дату блокировки
      const authUser: AuthUser = {
        ...userData,
        status: userData.status || "active",
        blockedUntil: userData.blockedUntil || null,
      };
      (req as AuthRequest).user = authUser;

      return next();
    } catch (e) {
      if (optional) {
        (req as OptionalAuthRequest).user = null;
        return next();
      } else {
        return next(ApiError.UnauthorizedError());
      }
    }
  };
};

// Создаем специальную middleware для refresh
authMiddleware.refreshMiddleware =
  () =>
  async (
    req: AuthRequest | OptionalAuthRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const refreshToken =
        (req as RequestWithCookies).cookies?.refreshToken ||
        (req.headers?.["refresh-token"] as string);

      if (!refreshToken) {
        return next(ApiError.UnauthorizedError());
      }

      const userData = validateRefreshToken(refreshToken) as AuthUser | null;

      if (!userData) {
        return next(ApiError.UnauthorizedError());
      }

      const isRevoked = false;

      if (isRevoked) {
        return next(ApiError.UnauthorizedError());
      }

      // 🔒 ПРОВЕРКА БЛОКИРОВКИ ПОЛЬЗОВАТЕЛЯ ДЛЯ REFRESH
      try {
        const blockStatus = await UserSanctionService.checkUserBlockStatus(
          userData.id,
        );

        if (blockStatus.user.status === "blocked") {
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
          return next(ApiError.ForbiddenError(errorMessage, undefined));
        }
      } catch (blockCheckError) {
        // В случае ошибки продолжаем
      }

      (req as AuthRequest).user = userData;
      next();
    } catch (e) {
      return next(ApiError.UnauthorizedError());
    }
  };

/**
 * Вспомогательная функция для быстрого создания миддлвары с определенными ролями
 */
authMiddleware.withRoles = (allowedRoles: string[] = []) =>
  authMiddleware({ allowedRoles, optional: false });

/**
 * Вспомогательная функция для создания опциональной миддлвары
 */
authMiddleware.optional = (allowedRoles: string[] = []) =>
  authMiddleware({ allowedRoles, optional: true });

/**
 * Декоратор для маршрутов, требующих определенной роли
 */
authMiddleware.requireRole = (role: string) =>
  authMiddleware({ allowedRoles: [role], optional: false });

/**
 * Декоратор для маршрутов, доступных только аутентифицированным пользователям
 */
authMiddleware.requireAuth = () =>
  authMiddleware({
    allowedRoles: ["all"],
    optional: false,
    checkBlock: false,
  });

/**
 * Декоратор для опциональной проверки с любой ролью
 */
authMiddleware.optionalAuth = () =>
  authMiddleware({ allowedRoles: [], optional: true });

/**
 * Специальная миддлвара для отключения проверки блокировки
 * (например, для endpoints, которые должны быть доступны даже заблокированным пользователям)
 */
authMiddleware.withoutBlockCheck = (options: AuthMiddlewareOptions = {}) =>
  authMiddleware({ ...options, checkBlock: false });

/**
 * Миддлвара только для проверки блокировки (без проверки ролей)
 */
authMiddleware.blockCheckOnly =
  () => async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return next();
    }

    try {
      const blockStatus = await UserSanctionService.checkUserBlockStatus(
        req.user.id,
      );

      if (blockStatus.user.status === "blocked") {
        const blockedUntil = blockStatus.user.blockedUntil
          ? new Date(blockStatus.user.blockedUntil)
          : null;

        const errorMessage = formatBlockMessage(blockedUntil);
        return next(ApiError.ForbiddenError(errorMessage, undefined));
      }
      next();
    } catch (error) {
      next(); // В случае ошибки разрешаем доступ
    }
  };

// Экспортируем как default, сохраняя все методы
export default authMiddleware;
