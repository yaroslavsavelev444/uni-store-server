// middlewares/deviceAuthMiddleware.ts
import type { NextFunction, Request, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { UserModel } from "../models/index.models.js";
import {
  type AccessCheckResult,
  type DeviceAuthRequest,
  type DeviceInfo,
  type DevicePlatform,
  ROLE_ACCESS_POLICIES,
} from "../types/deviceAuth.js";
import type { IUser, UserRole } from "../types/user.types.js";

/**
 * Извлекает информацию об устройстве из заголовков запроса
 */
export function extractDeviceInfo(req: Request): DeviceInfo {
  return {
    platform: (req.headers["x-device-platform"] as DevicePlatform) || "unknown",
    deviceId: req.headers["x-device-id"] as string,
    appVersion: req.headers["x-app-version"] as string,
    userAgent:
      (req.headers["x-user-agent"] as string) ||
      (req.headers["user-agent"] as string),
    timestamp: req.headers["x-timestamp"] as string,
  };
}

/**
 * Проверяет доступ на основе роли пользователя и платформы устройства
 */
export function validateDeviceAccess(
  userRole: UserRole,
  devicePlatform: DevicePlatform,
): AccessCheckResult {
  const policy = ROLE_ACCESS_POLICIES[userRole];

  if (!policy) {
    logger.warn(`No access policy defined for role: ${userRole}`);
    return {
      allowed: false,
      message: "Не определена политика доступа для вашей роли",
    };
  }

  const isAllowed = policy.allowedPlatforms.includes(devicePlatform);

  return {
    allowed: isAllowed,
    message: isAllowed ? policy.message : `Доступ запрещен: ${policy.message}`,
    requiredPlatforms: policy.allowedPlatforms,
    currentPlatform: devicePlatform,
  };
}

/**
 * Проверка доступа для существующего пользователя при логине
 */
export async function checkExistingUserAccess(
  email: string,
  deviceInfo: DeviceInfo,
): Promise<void> {
  try {
    const user = await UserModel.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      // Если пользователь не найден, пропускаем - будет ошибка в контроллере
      return;
    }

    const accessCheck = validateDeviceAccess(user.role, deviceInfo.platform);

    if (!accessCheck.allowed) {
      logger.warn(
        `Login attempt denied for user ${user._id} (${user.role}) ` +
          `from platform ${deviceInfo.platform}`,
      );
      throw ApiError.ForbiddenError(accessCheck.message);
    }

    logger.info(
      `Login allowed for user ${user._id} (${user.role}) from ${deviceInfo.platform}`,
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Если ошибка БД - логируем, но пропускаем запрос дальше
    logger.error({
      message: "Error checking existing user access",
      error,
    });
  }
}

/**
 * Миддлвара для проверки доступа по устройству ДО аутентификации
 * Используется на эндпоинтах login/register
 */
export function createAuthMiddleware() {
  return async function deviceAuthMiddleware(
    req: DeviceAuthRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const deviceInfo = extractDeviceInfo(req);
      const { email } = req.body;

      // Для логина - проверяем существующего пользователя
      if (req.path.includes("/login") && email) {
        await checkExistingUserAccess(email, deviceInfo);
      }

      // Для регистрации - дополнительных проверок не требуется (функционал юриста удалён)

      // Добавляем информацию об устройстве в request для дальнейшего использования
      req.device = deviceInfo;
      next();
    } catch (error) {
      logger.error({
        message: "Error checking device access",
        error,
      });
      next(error);
    }
  };
}

/**
 * Проверка после аутентификации (используется в контроллерах)
 */
export function checkPostAuthAccess(user: IUser, deviceInfo: DeviceInfo): void {
  const accessCheck = validateDeviceAccess(user.role, deviceInfo.platform);

  if (!accessCheck.allowed) {
    logger.warn(
      `Post-auth access denied for user ${user._id} (${user.role}) ` +
        `from platform ${deviceInfo.platform}`,
    );
    throw ApiError.ForbiddenError(accessCheck.message);
  }
}
