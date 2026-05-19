import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import type { SignOptions } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { UserSecurityModel, UserSessionModel } from "../models/index.models.js";
import type { UserSessionDocument } from "../types/userSession.types.js";

const { sign, verify } = jwt;

// Проверка переменных окружения
const requiredEnvVars = [
  "ACCESS_TOKEN",
  "REFRESH_TOKEN",
  "JWT_ACTIVATION_SECRET",
  "JWT_RESET_SECRET_KEY",
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`⛔ Отсутствует переменная окружения: ${key}`);
  }
}

// Типы для опций генерации токенов
interface GenerateTokenOptions {
  onlyAccess?: boolean;
}

export interface TokenPayload {
  id?: string;
  email?: string;
  role?: string;
}

interface RefreshTokenPayload extends TokenPayload {
  id: string;
}

// Тип для результата генерации токенов
interface TokenResult {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Генерация пары токенов (access + refresh)
 */
export function generateToken(
  payload: TokenPayload,
  options: GenerateTokenOptions = {},
): TokenResult {
  const accessToken = sign(payload, process.env.ACCESS_TOKEN!, {
    expiresIn: "24h",
  } satisfies SignOptions);

  if (options.onlyAccess) {
    return { accessToken };
  }

  const refreshToken = sign(payload, process.env.REFRESH_TOKEN!, {
    expiresIn: "30d",
  } satisfies SignOptions);

  return { accessToken, refreshToken };
}

/**
 * Сохраняет refresh-токен в сессии (обновляет или создаёт)
 */
export async function saveToken(
  userId: string,
  refreshToken: string,
): Promise<UserSessionDocument> {
  const tokenData = await UserSessionModel.findOne({ userId });
  if (tokenData) {
    tokenData.refreshToken = refreshToken;
    await tokenData.save();
    return tokenData;
  }

  const newSession = new UserSessionModel({ userId, refreshToken });
  return await newSession.save();
}

/**
 * Удаляет сессию по refresh-токену
 */
export async function removeToken(
  refreshToken: string,
): Promise<UserSessionDocument> {
  const tokenData = await UserSessionModel.findOneAndDelete({
    refreshToken,
  }).exec();
  if (!tokenData) {
    throw ApiError.BadRequest("Токен не найден");
  }
  return tokenData;
}

/**
 * Валидация access-токена
 */
export function validateAccessToken(
  token: string | null | undefined,
): TokenPayload | null {
  if (!token) {
    logger.error("Access token not provided");
    return null;
  }
  try {
    return verify(token, process.env.ACCESS_TOKEN!) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Валидация refresh-токена
 */
export function validateRefreshToken(
  token: string | null | undefined,
): RefreshTokenPayload | null {
  if (!token) {
    logger.error("Refresh token not found");
    return null;
  }
  try {
    return verify(token, process.env.REFRESH_TOKEN!) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Валидация токена активации
 */
export function validateActivationToken(
  token: string,
): TokenPayload | { expired: true } | null {
  try {
    return verify(token, process.env.JWT_ACTIVATION_SECRET!) as TokenPayload;
  } catch (err) {
    if ((err as Error).name === "TokenExpiredError") {
      return { expired: true };
    }
    return null;
  }
}

/**
 * Поиск сессии по refresh-токену
 */
export async function findToken(
  refreshToken: string,
): Promise<UserSessionDocument | null> {
  return await UserSessionModel.findOne({ refreshToken }).exec();
}

/**
 * Генерация и сохранение токена для сброса пароля
 */
export async function generatePasswordResetToken(
  userId: string,
  type: "pending" | "verified",
): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");

  // JWT для клиента
  const signedToken = sign(
    { userId, rawToken },
    process.env.JWT_RESET_SECRET_KEY!,
    { expiresIn: "15m" } satisfies SignOptions,
  );

  // Хэшируем rawToken для хранения в БД
  const hashedToken = await hash(rawToken, 10);

  const userSecurity = await UserSecurityModel.findOne({ userId });
  if (!userSecurity) {
    throw ApiError.NotFoundError("Пользователь не найден");
  }
  userSecurity.resetTokenHash = hashedToken;
  userSecurity.resetTokenExpiration = new Date(Date.now() + 15 * 60 * 1000);
  userSecurity.resetTokenStatus = type;
  userSecurity.resetTokenAttempts = 0;
  await userSecurity.save();

  return signedToken;
}

/**
 * Проверка токена сброса пароля
 */
export async function verifyPasswordResetToken(token: string): Promise<{
  userId: string;
  decoded: TokenPayload & { rawToken: string };
}> {
  let decoded: TokenPayload & { rawToken: string };
  try {
    decoded = verify(
      token,
      process.env.JWT_RESET_SECRET_KEY!,
    ) as TokenPayload & {
      rawToken: string;
    };
  } catch {
    throw ApiError.BadRequest("Неверный или истёкший токен");
  }

  const userId = decoded.userId as string;
  const userSecurity = await UserSecurityModel.findOne({ userId });

  if (!userSecurity?.resetTokenHash) {
    throw ApiError.BadRequest("Токен не найден или уже использован");
  }

  const isMatch = await compare(decoded.rawToken, userSecurity.resetTokenHash);
  if (!isMatch) {
    await UserSecurityModel.updateOne(
      { userId },
      { $inc: { resetTokenAttempts: 1 } },
    );
    throw ApiError.BadRequest("Неверный токен");
  }

  if (
    userSecurity.resetTokenExpiration &&
    userSecurity.resetTokenExpiration < new Date()
  ) {
    throw ApiError.BadRequest("Срок действия токена истёк");
  }

  if ((userSecurity.resetTokenAttempts ?? 0) >= 5) {
    throw ApiError.TooManyRequestsError(
      "Превышено количество попыток. Запросите новый токен.",
    );
  }

  return { userId, decoded };
}

/**
 * Извлекает refresh-токен из запроса (cookies, headers, body)
 */
export function getRefreshTokenFromRequest(req: {
  cookies?: { refreshToken?: string };
  headers?: { "refresh-token"?: string };
  body?: { refreshToken?: string };
  path?: string;
}): string | undefined {
  let refreshToken = req.cookies?.refreshToken;

  if (!refreshToken && req.headers?.["refresh-token"]) {
    refreshToken = req.headers["refresh-token"];
  }

  if (!refreshToken && req.body?.refreshToken) {
    refreshToken = req.body.refreshToken;
  }

  if (refreshToken) {
    const source = req.cookies?.refreshToken
      ? "cookie"
      : req.headers?.["refresh-token"]
        ? "header"
        : req.body?.refreshToken
          ? "body"
          : "unknown";

    logger.debug({
      message: "Refresh token found in request",
      source,
      path: req.path,
    });
  }

  return refreshToken;
}

/**
 * Проверяет, отозвана ли сессия по refresh-токену
 */
async function isSessionRevoked(refreshToken: string): Promise<boolean> {
  const session = await UserSessionModel.findOne({ refreshToken }).exec();
  return session?.revoked === true;
}

/**
 * Проверяет refresh-токен из запроса и валидирует его принадлежность пользователю
 */
export async function validateRefreshTokenFromRequest(
  req: {
    cookies?: { refreshToken?: string };
    headers?: { "refresh-token"?: string };
    body?: { refreshToken?: string };
    ip?: string;
    path?: string;
  },
  userData: { id: string },
): Promise<void> {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      logger.warn({
        message: "Refresh token not found in request",
        ip: req.ip,
        path: req.path,
      });
      throw ApiError.UnauthorizedError();
    }

    // Валидируем сам refresh-токен
    const refreshTokenData = validateRefreshToken(refreshToken);
    if (!refreshTokenData || refreshTokenData.id !== userData.id) {
      logger.warn({
        message: "Invalid refresh token",
        userId: userData.id,
        ip: req.ip,
        path: req.path,
        refreshToken: `${refreshToken.substring(0, 10)}...`,
      });
      throw ApiError.UnauthorizedError();
    }

    // Проверяем, не отозван ли refresh-токен
    const revoked = await isSessionRevoked(refreshToken);
    if (revoked) {
      logger.warn({
        message: "Refresh token revoked",
        userId: userData.id,
        ip: req.ip,
        path: req.path,
        refreshToken: `${refreshToken.substring(0, 10)}...`,
      });
      throw ApiError.UnauthorizedError();
    }

    logger.debug({
      message: "Refresh token validated",
      userId: userData.id,
      ip: req.ip,
      path: req.path,
      refreshToken: `${refreshToken.substring(0, 10)}...`,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw error;
    }
    logger.error("Error during refresh token validation", {
      userId: userData.id,
      error: (error as Error).message,
      path: req.path,
      stack: (error as Error).stack,
    });
    throw ApiError.UnauthorizedError();
  }
}

// Экспорт по умолчанию для обратной совместимости
export default {
  generateToken,
  saveToken,
  removeToken,
  validateAccessToken,
  validateRefreshToken,
  findToken,
  validateActivationToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  validateRefreshTokenFromRequest,
};
