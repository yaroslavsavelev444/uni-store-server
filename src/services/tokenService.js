const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const ApiError = require("../exceptions/api-error");
const { UserModel, UserSessionModel, UserSecurityModel } = require("../models/index.models");
const logger = require("../logger/logger");
const bcrypt = require("bcryptjs");
const SessionService = require("./SessionService");
// Проверка всех необходимых ключей при загрузке
const checkEnvVars = () => {
  const required = ["ACCESS_TOKEN", "REFRESH_TOKEN", "JWT_ACTIVATION_SECRET", "JWT_RESET_SECRET_KEY"];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`⛔ Отсутствует переменная окружения: ${key}`);
    }
  }
};
checkEnvVars();

// Генерация пары токенов
function generateToken(payload, options = {}) {
  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN, {
    expiresIn: "24h",
  });

  if (options.onlyAccess) return { accessToken };

  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN, {
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
  const tokenData = await UserSessionModel.findOneAndDelete({ refreshToken }).exec();
  if (!tokenData) {
    throw ApiError.BadRequest("Токен не найден");
  }
  return tokenData;
};

// Проверка access токена
const validateAccessToken = (token) => {
   logger.info(token);
  if (!token) {
  logger.error("Access token not provided");
  return null;
}
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN);
  } catch (e) {
    return null;
    
  }
};

// Проверка refresh токена
const validateRefreshToken = (token) => {
  logger.info(token);
  if(!token) {
    return logger.error("Refresh token not found");
  };
  try {
    return jwt.verify(token, process.env.REFRESH_TOKEN);
  } catch (e) {
    return null;
  }
};

// Проверка активационного токена
const validateActivationToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_ACTIVATION_SECRET);
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
  const rawToken = crypto.randomBytes(32).toString("hex");

  // JWT для клиента
  const signedToken = jwt.sign(
    { userId: userId.toString(), rawToken }, 
    process.env.JWT_RESET_SECRET_KEY,
    { expiresIn: "15m" } 
  );

  // В БД храним хэш от rawToken
  const hashedToken = await bcrypt.hash(rawToken, 10);

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
    decoded = jwt.verify(token, process.env.JWT_RESET_SECRET_KEY);
  } catch (err) {
    throw ApiError.BadRequest("Неверный или истёкший токен");
  }

  const userId = decoded.userId;
  const userSecurity = await UserSecurityModel.findOne({ userId });
  
  if (!userSecurity || !userSecurity.resetTokenHash) {
    throw ApiError.BadRequest("Токен не найден или уже использован");
  }

  const isMatch = await bcrypt.compare(decoded.rawToken, userSecurity.resetTokenHash);
  if (!isMatch) {
    // Увеличиваем счетчик неудачных попыток
    await UserSecurityModel.updateOne(
      { userId },
      { $inc: { resetTokenAttempts: 1 } }
    );
    throw ApiError.BadRequest("Неверный токен");
  }

  if (userSecurity.resetTokenExpiration < Date.now()) {
    throw ApiError.BadRequest("Срок действия токена истёк");
  }

  // Проверяем лимит попыток
  if (userSecurity.resetTokenAttempts >= 5) {
    throw ApiError.TooManyRequests("Превышено количество попыток. Запросите новый токен.");
  }

  return { userId, decoded };
};


function getRefreshTokenFromRequest(req) {
  // 1. Пробуем получить из cookie (для веб-клиентов, кроме Safari)
  let refreshToken = req.cookies?.refreshToken;
  
  // 2. Пробуем получить из заголовков (для Safari и мобильных клиентов)
  if (!refreshToken && req.headers['refresh-token']) {
    refreshToken = req.headers['refresh-token'];
  }
  
  // 3. Пробуем получить из body (для API запросов)
  if (!refreshToken && req.body?.refreshToken) {
    refreshToken = req.body.refreshToken;
  }

  // Логируем источник токена для отладки
  if (refreshToken) {
    const source = req.cookies?.refreshToken ? 'cookie' : 
                  req.headers['refresh-token'] ? 'header' : 
                  req.body?.refreshToken ? 'body' : 'unknown';
    
    logger.debug(`Refresh token obtained from ${source}`, {
      path: req.path,
      tokenPreview: refreshToken.substring(0, 10) + '...'
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
      logger.warn("Refresh token not provided for protected route", {
        userId: userData.id,
        ip: req.ip,
        path: req.path,
        userAgent: req.headers['user-agent']
      });
      throw ApiError.UnauthorizedError("Требуется повторная авторизация");
    }

    // Дополнительная проверка: валидируем сам refresh token
    // (чтобы убедиться, что он принадлежит этому пользователю)
    try {
      const refreshTokenData = await tokenService.validateRefreshToken(refreshToken);
      
      if (!refreshTokenData || refreshTokenData.id !== userData.id) {
        logger.warn("Refresh token doesn't match user", {
          userId: userData.id,
          expectedUserId: refreshTokenData?.id,
          ip: req.ip,
          path: req.path
        });
        throw ApiError.UnauthorizedError("Невалидная сессия");
      }
    } catch (validationError) {
      // Если это ошибка валидации (не ApiError), преобразуем
      if (!(validationError instanceof ApiError)) {
        logger.warn("Refresh token validation failed", {
          userId: userData.id,
          error: validationError.message,
          ip: req.ip
        });
        throw ApiError.UnauthorizedError("Сессия устарела");
      }
      throw validationError;
    }

    // Проверяем, не отозван ли refresh token
    const isRevoked = await SessionService.isSessionRevoked(refreshToken);
    if (isRevoked) {
      logger.warn("Access attempt with revoked refresh token", {
        userId: userData.id,
        ip: req.ip,
        path: req.path,
        refreshToken: refreshToken.substring(0, 10) + '...',
        userAgent: req.headers['user-agent']
      });
      throw ApiError.UnauthorizedError("Сессия была отозвана. Пожалуйста, войдите снова.");
    }

    logger.debug("Refresh token validation successful", {
      userId: userData.id,
      path: req.path,
      tokenSource: req.cookies?.refreshToken ? 'cookie' : 'header'
    });
  } catch (error) {
    // Если ошибка не связана с отзывом токена, пробрасываем дальше
    if (error instanceof ApiError.UnauthorizedError) {
      throw error;
    }
    
    // Для других ошибок (например, проблемы с Redis) логируем, но не блокируем доступ
    logger.error("Error during refresh token validation", {
      userId: userData.id,
      error: error.message,
      path: req.path,
      stack: error.stack
    });
    
    // В продакшене можно решить, блокировать ли доступ при ошибках валидации
    // В зависимости от требований безопасности:
    // 1. Если безопасность критична - бросаем ошибку
    // 2. Если доступ важнее - пропускаем с предупреждением
    
    // По умолчанию бросаем ошибку для безопасности
    throw ApiError.UnauthorizedError("Ошибка проверки сессии");
  }
}



module.exports = {
  generateToken,
  saveToken,
  removeToken,
  validateAccessToken,
  validateRefreshToken,
  findToken,
  validateActivationToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  validateRefreshTokenFromRequest
};