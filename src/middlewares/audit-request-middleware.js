// middlewares/audit-request-middleware.js
const auditLogger = require("../logger/auditLogger");

/**
 * Получение IP адреса из запроса
 */
const getClientIp = (req) => {
  return (
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    "unknown"
  );
};

/**
 * Очистка чувствительных данных из тела запроса
 */
const sanitizeBody = (body) => {
  if (!body || typeof body !== "object") {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields = [
    "password",
    "newPassword",
    "oldPassword",
    "confirmPassword",
    "token",
    "refreshToken",
    "accessToken",
    "authorization",
    "secret",
    "apiKey",
    "apikey",
    "privateKey",
    "creditCard",
    "cardNumber",
    "cvv",
    "cvc",
    "ssn",
    "socialSecurity",
    "passport",
    "phone",
    "telephone",
    "mobile", // можно маскировать, но пока удаляем
  ];

  sensitiveFields.forEach((field) => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = "***REDACTED***";
    }

    // Также проверяем вложенные объекты
    Object.keys(sanitized).forEach((key) => {
      if (sanitized[key] && typeof sanitized[key] === "object") {
        sanitized[key] = sanitizeBody(sanitized[key]);
      }
    });
  });

  return sanitized;
};

/**
 * Определение типа пользователя по роли
 */
const getUserType = (user) => {
  if (!user) return "guest";
  if (user.role === "admin" || user.role === "superadmin") return "admin";
  if (user.role === "moderator") return "moderator";
  return "user";
};

/**
 * Определение является ли путь публичным (не требующим аудита)
 */
const isPublicPath = (path) => {
  const publicPaths = [
    "/health",
    "/healthz",
    "/ready",
    "/live",
    "/metrics",
    "/favicon.ico",
    "/robots.txt",
    "/static/",
    "/public/",
    "/uploads/",
    "/images/",
  ];

  return publicPaths.some(
    (publicPath) => path === publicPath || path.startsWith(publicPath)
  );
};

/**
 * Определение является ли путь админским
 */
const isAdminPath = (path) => {
  const adminPaths = ["/admin/", "/api/admin/", "/management/", "/dashboard/"];

  return adminPaths.some((adminPath) => path.startsWith(adminPath));
};

/**
 * Группировка HTTP методов для классификации
 */
const getRequestCategory = (method, path) => {
  const methodType = method.toUpperCase();

  // CREATE операции
  if (
    methodType === "POST" &&
    !path.includes("/search") &&
    !path.includes("/filter")
  ) {
    return "CREATE";
  }

  // READ операции
  if (methodType === "GET" || methodType === "HEAD") {
    return "READ";
  }

  // UPDATE операции
  if (methodType === "PUT" || methodType === "PATCH") {
    return "UPDATE";
  }

  // DELETE операции
  if (methodType === "DELETE") {
    return "DELETE";
  }

  return "OTHER";
};

/**
 * Middleware для логирования всех входящих запросов
 */
const auditRequestMiddleware = (options = {}) => {
  const config = {
    // Включать тело запроса в логи (осторожно с большими телами)
    logRequestBody: false,
    // Максимальный размер тела для логирования (в байтах)
    maxBodySize: 1024 * 10, // 10KB
    // Игнорировать определенные пути
    ignorePaths: [],
    // Логировать только определенные методы
    logMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    // Включать user agent
    includeUserAgent: true,
    // Включать реферер
    includeReferer: true,
    // Порог для логирования медленных запросов (в мс)
    slowRequestThreshold: 1000,
    // Логировать успешные запросы
    logSuccess: true,
    // Логировать ошибки клиента (4xx)
    logClientErrors: true,
    // Логировать ошибки сервера (5xx)
    logServerErrors: true,
    ...options,
  };

  return (req, res, next) => {
    // Пропускаем публичные пути
    if (isPublicPath(req.path)) {
      return next();
    }

    // Пропускаем игнорируемые пути
    if (config.ignorePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Пропускаем нелогируемые методы
    if (!config.logMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    const startTime = Date.now();
    const clientIp = getClientIp(req);
    const requestId =
      req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Сохраняем метаданные запроса для использования после завершения
    req._auditMetadata = {
      startTime,
      clientIp,
      requestId,
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
    };

    // Логирование начала запроса (для долгих операций)
    if (config.logRequestBody && req.body && Object.keys(req.body).length > 0) {
      const bodySize = JSON.stringify(req.body).length;
      if (bodySize <= config.maxBodySize) {
        const sanitizedBody = sanitizeBody(req.body);
        auditLogger.loggers.app.debug({
          event: "REQUEST_START",
          requestId,
          method: req.method,
          path: req.path,
          ip: clientIp,
          userId: req.user?.id,
          body: sanitizedBody,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Обработка завершения запроса
    const originalEnd = res.end;
    const originalWrite = res.write;
    let responseBodyChunks = [];

    // Перехватываем запись ответа для логирования тела (если нужно)
    if (config.logRequestBody) {
      res.write = function (chunk, encoding, callback) {
        responseBodyChunks.push(chunk);
        return originalWrite.call(this, chunk, encoding, callback);
      };

      res.end = function (chunk, encoding, callback) {
        if (chunk) {
          responseBodyChunks.push(chunk);
        }

        return originalEnd.call(this, chunk, encoding, function () {
          // Вызываем логирование после завершения ответа
          setTimeout(
            () =>
              logRequestCompletion(
                req,
                res,
                startTime,
                clientIp,
                requestId,
                responseBodyChunks,
                config
              ),
            0
          );

          if (callback) {
            callback();
          }
        });
      };
    } else {
      res.end = function (chunk, encoding, callback) {
        const end = originalEnd.call(this, chunk, encoding, callback);
        // Вызываем логирование после завершения ответа
        setTimeout(
          () =>
            logRequestCompletion(
              req,
              res,
              startTime,
              clientIp,
              requestId,
              [],
              config
            ),
          0
        );
        return end;
      };
    }

    // Обработка ошибок
    const originalErrorHandler = req.on;
    req.on = function (event, listener) {
      if (event === "error") {
        return originalErrorHandler.call(this, event, function (err) {
          // Логируем ошибку запроса
          logRequestError(req, err, startTime, clientIp, requestId, config);
          listener(err);
        });
      }
      return originalErrorHandler.call(this, event, listener);
    };

    next();
  };
};

/**
 * Логирование завершения запроса
 */
const logRequestCompletion = (
  req,
  res,
  startTime,
  clientIp,
  requestId,
  responseBodyChunks,
  config
) => {
  try {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;
    const isClientError = statusCode >= 400 && statusCode < 500;
    const isServerError = statusCode >= 500;
    const isSlow = duration > config.slowRequestThreshold;

    // Определяем нужно ли логировать этот запрос
    let shouldLog = false;

    if (isServerError && config.logServerErrors) {
      shouldLog = true;
    } else if (isClientError && config.logClientErrors) {
      shouldLog = true;
    } else if (!isError && config.logSuccess) {
      shouldLog = true;
    }

    if (!shouldLog && !isSlow) {
      return;
    }

    // Собираем данные для логирования
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      status: statusCode,
      duration: `${duration}ms`,
      ip: clientIp,
      userId: req.user?.id || "anonymous",
      userType: getUserType(req.user),
      userAgent: config.includeUserAgent
        ? req.headers["user-agent"]
        : undefined,
      referer: config.includeReferer
        ? req.headers.referer || req.headers.referrer
        : undefined,
      query: Object.keys(req.query || {}).length > 0 ? req.query : undefined,
      params: Object.keys(req.params || {}).length > 0 ? req.params : undefined,
      timestamp: new Date().toISOString(),
    };

    // Добавляем тело ответа для ошибок (ограниченно)
    if (
      isError &&
      responseBodyChunks.length > 0 &&
      responseBodyChunks.length < 5
    ) {
      try {
        const responseBody = Buffer.concat(responseBodyChunks).toString("utf8");
        if (responseBody.length < 500) {
          // Ограничиваем размер
          const parsed = safeJsonParse(responseBody);
          logData.response = parsed || responseBody.substring(0, 200);
        }
      } catch (e) {
        // Игнорируем ошибки парсинга
      }
    }

    // Определяем уровень логирования
    let logLevel = "info";
    if (isServerError) logLevel = "error";
    else if (isClientError) logLevel = "warn";
    else if (isSlow) logLevel = "warn";

    // Логируем в соответствующий логгер
    if (logLevel === "error") {
      auditLogger.loggers.error[logLevel](logData);
    } else {
      auditLogger.loggers.access[logLevel](logData);
    }

    // Дополнительное логирование для медленных запросов
    if (isSlow) {
      auditLogger.loggers.app.warn({
        event: "SLOW_REQUEST",
        ...logData,
        threshold: `${config.slowRequestThreshold}ms`,
      });
    }

    // Логирование админских действий отдельно
    if (isAdminPath(req.path) && req.user) {
      const action = getRequestCategory(req.method, req.path);
      const event = isError ? "ADMIN_REQUEST_ERROR" : "ADMIN_REQUEST";

      auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        event,
        action,
        null,
        [],
        `${req.method} ${req.path} - ${statusCode} (${duration}ms)`
      );
    }

    // Логирование пользовательских действий для важных операций
    if (req.user && !isAdminPath(req.path)) {
      const importantPaths = [
        "/api/auth/",
        "/api/profile/",
        "/api/payment/",
        "/api/orders/",
        "/api/settings/",
      ];

      const isImportant = importantPaths.some((path) =>
        req.path.startsWith(path)
      );
      const isWriteOperation = ["POST", "PUT", "PATCH", "DELETE"].includes(
        req.method.toUpperCase()
      );

      if ((isImportant || isWriteOperation) && !isError) {
        const action = getRequestCategory(req.method, req.path);
        auditLogger.logUserEvent(
          req.user.id,
          req.user.email,
          "USER_REQUEST",
          action,
          {
            ip: clientIp,
            endpoint: req.path,
            method: req.method,
            statusCode,
            duration: `${duration}ms`,
          }
        );
      }
    }

    // Логирование подозрительной активности
    if (statusCode === 401 || statusCode === 403) {
      logSuspiciousActivity(req, statusCode, clientIp);
    }
  } catch (error) {
    // Ошибка логирования не должна влиять на работу приложения
    console.error("❌ Ошибка при логировании запроса:", error.message);
  }
};

/**
 * Логирование ошибок запроса
 */
const logRequestError = (
  req,
  error,
  startTime,
  clientIp,
  requestId,
  config
) => {
  const duration = Date.now() - startTime;

  auditLogger.loggers.error.error({
    requestId,
    event: "REQUEST_ERROR",
    method: req.method,
    path: req.path,
    ip: clientIp,
    userId: req.user?.id,
    error: error.message,
    stack: error.stack?.split("\n").slice(0, 5).join("\n"), // Ограничиваем stack trace
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Логирование подозрительной активности
 */
const logSuspiciousActivity = (req, statusCode, clientIp) => {
  const suspiciousPaths = [
    "/admin",
    "/login",
    "/api/auth",
    "/api/admin",
    "/api/payment",
    "/api/users",
  ];

  const isSuspiciousPath = suspiciousPaths.some((path) =>
    req.path.includes(path)
  );

  if (isSuspiciousPath) {
    auditLogger.loggers.app.warn({
      event: "SUSPICIOUS_ACTIVITY",
      type: statusCode === 401 ? "UNAUTHORIZED_ACCESS" : "FORBIDDEN_ACCESS",
      ip: clientIp,
      path: req.path,
      method: req.method,
      userId: req.user?.id || "anonymous",
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Безопасный парсинг JSON
 */
const safeJsonParse = (str) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

module.exports = auditRequestMiddleware;

// Экспорт вспомогательных функций для тестирования
module.exports.helpers = {
  getClientIp,
  sanitizeBody,
  getUserType,
  isPublicPath,
  isAdminPath,
  getRequestCategory,
  safeJsonParse,
};
