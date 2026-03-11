import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import pkg from "jsonwebtoken";

const { sign, verify } = pkg;

import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";

const { info, warn, error: _error, debug } = logger;

import { UserSecurityModel, UserSessionModel } from "../models/index.models.js";
import SessionService from "./SessionService.js";

const { isSessionRevoked } = SessionService;

// Проверка всех необходимых ключей при загрузке
const checkEnvVars = () => {
  const required = [
    "ACCESS_TOKEN",
    "REFRESH_TOKEN",
    "JWT_ACTIVATION_SECRET",
    "JWT_RESET_SECRET_KEY",
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`⛔ Отсутствует переменная окружения: ${key}`);
    }
  }
};
checkEnvVars();

// Генерация пары токенов
function generateToken(payload, options = {}) {
  const accessToken = sign(payload, process.env.ACCESS_TOKEN, {
    expiresIn: "24h",
  });

  if (options.onlyAccess) return { accessToken };

  const refreshToken = sign(payload, process.env.REFRESH_TOKEN, {
    expiresIn: "30d",
  });

  return { accessToken, refreshToken };
}

// Сохраняем refresh токен (обновляем или создаём)
const saveToken = async (userId, refreshToken) => {
  const tokenData = await UserSessionModel.findOne({ userId });
  if (tokenData) {
    tokenData.refreshToken = refreshToken;
    await tokenData.save();
    return tokenData;
  }

  const newSession = new UserSessionModel({ userId, refreshToken });
  return await newSession.save();
};

// Удаление refresh токена
const removeToken = async (refreshToken) => {
  const tokenData = await UserSessionModel.findOneAndDelete({
    refreshToken,
  }).exec();
  if (!tokenData) {
    throw ApiError.BadRequest("Токен не найден");
  }
  return tokenData;
};

// Проверка access токена
const validateAccessToken = (token) => {
  info(token);
  if (!token) {
    _error("Access token not provided");
    return null;
  }
  try {
    return verify(token, process.env.ACCESS_TOKEN);
  } catch (e) {
    return null;
  }
};

// Проверка refresh токена
const validateRefreshToken = (token) => {
  info(token);
  if (!token) {
    return _error("Refresh token not found");
  }
  try {
    return verify(token, process.env.REFRESH_TOKEN);
  } catch (e) {
    return null;
  }
};

// Проверка активационного токена
const validateActivationToken = (token) => {
  try {
    return verify(token, process.env.JWT_ACTIVATION_SECRET);
  } catch (e) {
    if (e.name === "TokenExpiredError") return { expired: true };
    return null;
  }
};

// Поиск refresh токена в базе
const findToken = async (refreshToken) => {
  return await UserSessionModel.findOne({ refreshToken }).exec();
};

// Генерация и сохранение токена для сброса пароля
const generatePasswordResetToken = async (userId, type) => {
  const rawToken = randomBytes(32).toString("hex");

  // JWT для клиента
  const signedToken = sign(
    { userId: userId.toString(), rawToken },
    process.env.JWT_RESET_SECRET_KEY,
    { expiresIn: "15m" },
  );

  // В БД храним хэш от rawToken
  const hashedToken = await hash(rawToken, 10);

  const userSecurity = await UserSecurityModel.findOne({ userId });
  userSecurity.resetTokenHash = hashedToken;
  userSecurity.resetTokenExpiration = Date.now() + 15 * 60 * 1000; // 15 минут
  userSecurity.resetTokenStatus = type;
  await userSecurity.save();

  return signedToken; // клиенту уходит только JWT
};
const verifyPasswordResetToken = async (token) => {
  let decoded;
  try {
    decoded = verify(token, process.env.JWT_RESET_SECRET_KEY);
  } catch (err) {
    throw ApiError.BadRequest("Неверный или истёкший токен");
  }

  const userId = decoded.userId;
  const userSecurity = await UserSecurityModel.findOne({ userId });

  if (!userSecurity || !userSecurity.resetTokenHash) {
    throw ApiError.BadRequest("Токен не найден или уже использован");
  }

  const isMatch = await compare(decoded.rawToken, userSecurity.resetTokenHash);
  if (!isMatch) {
    // Увеличиваем счетчик неудачных попыток
    await UserSecurityModel.updateOne(
      { userId },
      { $inc: { resetTokenAttempts: 1 } },
    );
    throw ApiError.BadRequest("Неверный токен");
  }

  if (userSecurity.resetTokenExpiration < Date.now()) {
    throw ApiError.BadRequest("Срок действия токена истёк");
  }

  // Проверяем лимит попыток
  if (userSecurity.resetTokenAttempts >= 5) {
    throw ApiError.TooManyRequests(
      "Превышено количество попыток. Запросите новый токен.",
    );
  }

  return { userId, decoded };
};

function getRefreshTokenFromRequest(req) {
  // 1. Пробуем получить из cookie (для веб-клиентов, кроме Safari)
  let refreshToken = req.cookies?.refreshToken;

  // 2. Пробуем получить из заголовков (для Safari и мобильных клиентов)
  if (!refreshToken && req.headers["refresh-token"]) {
    refreshToken = req.headers["refresh-token"];
  }

  // 3. Пробуем получить из body (для API запросов)
  if (!refreshToken && req.body?.refreshToken) {
    refreshToken = req.body.refreshToken;
  }

  // Логируем источник токена для отладки
  if (refreshToken) {
    const source = req.cookies?.refreshToken
      ? "cookie"
      : req.headers["refresh-token"]
        ? "header"
        : req.body?.refreshToken
          ? "body"
          : "unknown";

    debug(`Refresh token obtained from ${source}`, {
      path: req.path,
      tokenPreview: refreshToken.substring(0, 10) + "...",
    });
  }

  return refreshToken;
}

/**
 * Проверяет refresh token на отзыв с поддержкой Safari fallback
 */
async function validateRefreshTokenFromRequest(req, userData) {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      warn("Refresh token not provided for protected route", {
        userId: userData.id,
        ip: req.ip,
        path: req.path,
        userAgent: req.headers["user-agent"],
      });
      throw ApiError.UnauthorizedError("Требуется повторная авторизация");
    }

    // Дополнительная проверка: валидируем сам refresh token
    // (чтобы убедиться, что он принадлежит этому пользователю)
    try {
      const refreshTokenData =
        await tokenService.validateRefreshToken(refreshToken);

      if (!refreshTokenData || refreshTokenData.id !== userData.id) {
        warn("Refresh token doesn't match user", {
          userId: userData.id,
          expectedUserId: refreshTokenData?.id,
          ip: req.ip,
          path: req.path,
        });
        throw ApiError.UnauthorizedError("Невалидная сессия");
      }
    } catch (validationError) {
      // Если это ошибка валидации (не ApiError), преобразуем
      if (!(validationError instanceof ApiError)) {
        warn("Refresh token validation failed", {
          userId: userData.id,
          error: validationError.message,
          ip: req.ip,
        });
        throw ApiError.UnauthorizedError("Сессия устарела");
      }
      throw validationError;
    }

    // Проверяем, не отозван ли refresh token
    const isRevoked = await isSessionRevoked(refreshToken);
    if (isRevoked) {
      warn("Access attempt with revoked refresh token", {
        userId: userData.id,
        ip: req.ip,
        path: req.path,
        refreshToken: refreshToken.substring(0, 10) + "...",
        userAgent: req.headers["user-agent"],
      });
      throw ApiError.UnauthorizedError(
        "Сессия была отозвана. Пожалуйста, войдите снова.",
      );
    }

    debug("Refresh token validation successful", {
      userId: userData.id,
      path: req.path,
      tokenSource: req.cookies?.refreshToken ? "cookie" : "header",
    });
  } catch (error) {
    // Если ошибка не связана с отзывом токена, пробрасываем дальше
    if (error instanceof ApiError.UnauthorizedError) {
      throw error;
    }

    // Для других ошибок (например, проблемы с Redis) логируем, но не блокируем доступ
    _error("Error during refresh token validation", {
      userId: userData.id,
      error: error.message,
      path: req.path,
      stack: error.stack,
    });

    // В продакшене можно решить, блокировать ли доступ при ошибках валидации
    // В зависимости от требований безопасности:
    // 1. Если безопасность критична - бросаем ошибку
    // 2. Если доступ важнее - пропускаем с предупреждением

    // По умолчанию бросаем ошибку для безопасности
    throw ApiError.UnauthorizedError("Ошибка проверки сессии");
  }
}

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
