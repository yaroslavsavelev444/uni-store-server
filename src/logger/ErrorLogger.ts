import type { Request } from "express";
import type {
  ErrorLogData,
  ErrorType,
  RequestContext,
  ValidationError,
} from "../types/error.js";
import getIp from "../utils/getIp.js";
import logger from "./logger.js";

class ErrorLogger {
  private static readonly SENSITIVE_FIELDS = [
    "password",
    "newPassword",
    "oldPassword",
    "token",
    "refreshToken",
    "accessToken",
    "secret",
    "apiKey",
    "creditCard",
    "cvv",
    "ssn",
    "cardNumber",
    "expiryDate",
    "authorization",
    "cookie",
  ];

  private static readonly MAX_STACK_LINES = 15;
  private static readonly MAX_BODY_SIZE = 10;

  /**
   * Единый метод для логирования ВСЕХ ошибок
   */
  static logError(error: any, req?: Request | null): void {
    // Защита от рекурсии
    if (error?.__isLoggingError) {
      console.error("🚨 Recursive logging prevented");
      return;
    }

    try {
      const context = ErrorLogger.getRequestContext(req);
      const errorData = ErrorLogger.normalizeError(error);

      // Определяем уровень логирования по статусу
      const logLevel = ErrorLogger.getLogLevel(errorData.statusCode);

      // Создаем безопасный объект для логирования
      const logEntry = {
        ...errorData,
        ...context,
        environment: process.env.NODE_ENV || "development",
        __isLoggingError: true, // Флаг защиты
      };

      // Логируем через Pino с правильным уровнем
      if (logLevel === "error") {
        logger.error(logEntry, "Request failed");
      } else if (logLevel === "warn") {
        logger.warn(logEntry, "Request warning");
      } else {
        logger.info(logEntry, "Request info");
      }

      // В production для критических ошибок дублируем в консоль (на всякий случай)
      if (
        process.env.NODE_ENV === "production" &&
        errorData.statusCode >= 500
      ) {
        console.error("🔴 CRITICAL ERROR:", {
          type: errorData.errorType,
          message: errorData.message,
          endpoint: context.endpoint,
          requestId: context.requestId,
        });
      }
    } catch (loggingError) {
      // Абсолютный fallback
      console.error("❌ LOGGER FAILED:", {
        error: error?.message || String(error),
        loggingError:
          loggingError instanceof Error
            ? loggingError.message
            : String(loggingError),
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Логирование ошибок валидации
   */
  static logValidationError(
    errors: ValidationError[],
    req?: Request | null,
  ): void {
    const context = ErrorLogger.getRequestContext(req);

    logger.warn(
      {
        event: "VALIDATION_ERROR",
        errors: errors.map((e) => ({
          field: e.field || "unknown",
          message: e.message,
          ...(e.value && process.env.NODE_ENV !== "production"
            ? { value: e.value }
            : {}),
        })),
        ...context,
      },
      "Validation failed",
    );
  }

  /**
   * Получение контекста запроса
   */
  static getRequestContext(req?: Request | null): RequestContext {
    // Базовый контекст с timestamp
    const baseContext = {
      timestamp: new Date().toISOString(),
    };

    if (!req) {
      return {
        ...baseContext,
        ip: "unknown",
        endpoint: "unknown",
        method: "unknown",
        userAgent: "unknown",
        userId: "anonymous",
        userRole: "guest",
        requestId: ErrorLogger.generateRequestId(),
        errorInContext: "Request object is null or undefined",
      };
    }

    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      const context: RequestContext = {
        ...baseContext,
        ip: getIp(req) || "unknown",
        endpoint: req.originalUrl || req.url || "unknown",
        method: req.method || "unknown",
        userAgent: req.get("user-agent") || "unknown",
        userId: userId || "anonymous",
        userRole: userRole || "guest",
        requestId: (req as any).id || ErrorLogger.generateRequestId(),
      };

      // Добавляем query параметры (только если есть)
      if (req.query && Object.keys(req.query).length > 0) {
        context.query = req.query;
      }

      // Добавляем params (только если есть)
      if (req.params && Object.keys(req.params).length > 0) {
        context.params = req.params;
      }

      // Добавляем body только в development и если не слишком большой
      if (
        process.env.NODE_ENV === "development" &&
        req.body &&
        Object.keys(req.body).length <= ErrorLogger.MAX_BODY_SIZE
      ) {
        context.body = ErrorLogger.sanitizeBody(req.body);
      }

      return context;
    } catch {
      return {
        ...baseContext,
        ip: "unknown",
        endpoint: "unknown",
        method: "unknown",
        userAgent: "unknown",
        userId: "anonymous",
        userRole: "guest",
        requestId: ErrorLogger.generateRequestId(),
        errorInContext: "Failed to parse request context",
      };
    }
  }

  /**
   * Нормализация ошибки в единый формат
   */
  private static normalizeError(error: any): ErrorLogData {
    if (!error) {
      return {
        errorType: "UNKNOWN_ERROR",
        message: "No error object provided",
        statusCode: 500,
        name: "UnknownError",
      };
    }

    // ApiError
    if (error.status) {
      return {
        errorType: ErrorLogger.mapStatusCodeToEvent(error.status),
        message: error.message || "Unknown error",
        statusCode: error.status,
        errors: error.errors || [],
        name: error.name || "ApiError",
        stack: ErrorLogger.sanitizeStack(error.stack),
      };
    }

    // Стандартная Error
    if (error instanceof Error) {
      return {
        errorType: "INTERNAL_SERVER_ERROR",
        message: error.message,
        statusCode: 500,
        name: error.name,
        stack: ErrorLogger.sanitizeStack(error.stack),
      };
    }

    // Всё остальное
    return {
      errorType: "UNKNOWN_ERROR",
      message: String(error),
      statusCode: 500,
      name: "UnknownError",
    };
  }

  /**
   * Очистка stack trace
   */
  private static sanitizeStack(stack?: string): string | undefined {
    if (!stack || typeof stack !== "string") {
      return undefined;
    }

    return stack
      .split("\n")
      .map((line) => line.replace(/\/app\/src\//g, "~/"))
      .slice(0, ErrorLogger.MAX_STACK_LINES)
      .join("\n");
  }

  /**
   * Очистка чувствительных данных
   */
  private static sanitizeBody(body: any): any {
    if (!body || typeof body !== "object") {
      return body;
    }

    try {
      const sanitized = Array.isArray(body) ? [...body] : { ...body };

      const redact = (obj: any) => {
        for (const key in obj) {
          if (ErrorLogger.SENSITIVE_FIELDS.includes(key.toLowerCase())) {
            obj[key] = "***REDACTED***";
          } else if (obj[key] && typeof obj[key] === "object") {
            redact(obj[key]);
          }
        }
      };

      redact(sanitized);
      return sanitized;
    } catch {
      return { error: "Failed to sanitize body" };
    }
  }

  /**
   * Определение уровня логирования по статусу
   */
  private static getLogLevel(statusCode: number): "error" | "warn" | "info" {
    if (statusCode >= 500) return "error";
    if (statusCode >= 400) return "warn";
    return "info";
  }

  /**
   * Маппинг status code в тип ошибки
   */
  private static mapStatusCodeToEvent(statusCode: number): ErrorType {
    const map: Record<number, ErrorType> = {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "VALIDATION_ERROR",
      429: "RATE_LIMIT_EXCEEDED",
      500: "INTERNAL_SERVER_ERROR",
      502: "GATEWAY_ERROR",
      503: "SERVICE_UNAVAILABLE",
    };

    return map[statusCode] || "INTERNAL_SERVER_ERROR";
  }

  /**
   * Генерация ID запроса
   */
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}

export default ErrorLogger;
