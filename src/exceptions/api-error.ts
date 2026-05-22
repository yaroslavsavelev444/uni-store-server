import type { Request } from "express";
import type { ValidationError } from "../types/error.js";

export type BusinessErrorCode =
  | "BUSINESS_ALREADY_EXISTS"
  | "BUSINESS_NOT_FOUND"
  | "MAINTENANCE_MODE"
  | "INN_PROCESSING_ERROR"
  | "DATA_SOURCE_UNAVAILABLE"
  | "RATE_LIMIT_EXCEEDED"
  | "INVALID_INN"
  | "UNKNOWN_ERROR";

class ApiError extends Error {
  status: number;
  errors: any[];
  data?: any; // ← новое поле для дополнительных данных (code, blockedUntil и т.д.)
  requestContext: Request | null;

  constructor(
    status: number,
    message: string,
    errors: any[] = [],
    data?: any, // ← новый параметр
    requestContext: Request | null = null,
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.data = data;
    this.requestContext = requestContext;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }

  // === Специфические ошибки для нашего кейса ===
  static BusinessAlreadyExists(
    message = "Объявление с таким ИНН уже существует",
  ) {
    return new ApiError(409, message, [], {
      errorCode: "BUSINESS_ALREADY_EXISTS",
      errorType: "conflict",
    });
  }

  static BusinessNotFound(message = "Компания по указанному ИНН не найдена") {
    return new ApiError(404, message, [], {
      errorCode: "BUSINESS_NOT_FOUND",
      errorType: "not_found",
    });
  }

  static MaintenanceMode(
    message = "Сервис временно недоступен. Проводятся технические работы",
  ) {
    return new ApiError(503, message, [], {
      errorCode: "MAINTENANCE_MODE",
      errorType: "service_unavailable",
      retryAfter: "5m", // можно использовать на клиенте
    });
  }

  static DataSourceUnavailable(
    message = "Внешние источники данных временно недоступны",
  ) {
    return new ApiError(502, message, [], {
      errorCode: "DATA_SOURCE_UNAVAILABLE",
      errorType: "gateway_error",
    });
  }

  static InvalidInn(message = "Некорректный ИНН") {
    return new ApiError(400, message, [], {
      errorCode: "INVALID_INN",
      errorType: "validation_error",
    });
  }

  // 400 - Bad Request
  static BadRequest(
    message: string,
    errors: any[] = [],
    req?: Request,
  ): ApiError {
    return new ApiError(400, message, errors, undefined, req);
  }

  // 401 - Unauthorized
  static UnauthorizedError(req?: Request): ApiError {
    return new ApiError(401, "Пользователь не авторизован", [], undefined, req);
  }

  // 403 - Forbidden (расширен)
  static ForbiddenError(
    message: string = "Доступ запрещен",
    errors: any[] = [], // ← теперь можно передать errors
    data?: any, // ← можно передать дополнительные данные (code, blockedUntil)
    req?: Request,
  ): ApiError {
    return new ApiError(403, message, errors, data, req);
  }

  // 404 - Not Found
  static NotFoundError(
    message: string = "Объект не найден",
    req?: Request,
  ): ApiError {
    return new ApiError(404, message, [], undefined, req);
  }

  // 409 - Conflict
  static ConflictError(
    message: string = "Конфликт данных",
    req?: Request,
  ): ApiError {
    return new ApiError(409, message, [], undefined, req);
  }

  // 422 - Validation Error
  static ValidationError(
    errors: ValidationError[] = [],
    req?: Request,
  ): ApiError {
    return new ApiError(422, "Ошибка валидации", errors, undefined, req);
  }

  // 429 - Too Many Requests
  static TooManyRequestsError(
    message: string = "Слишком много запросов",
    req?: Request,
  ): ApiError {
    return new ApiError(429, message, [], undefined, req);
  }

  // 500 - Internal Server Error
  static InternalServerError(
    message: string = "Внутренняя ошибка сервера",
    req?: Request,
  ): ApiError {
    return new ApiError(500, message, [], undefined, req);
  }

  // 502 - Gateway Error
  static GatewayError(
    message: string = "Ошибка шлюза",
    req?: Request,
  ): ApiError {
    return new ApiError(502, message, [], undefined, req);
  }

  // 503 - Service Unavailable
  static ServiceUnavailableError(
    message: string = "Сервис временно недоступен",
    req?: Request,
  ): ApiError {
    return new ApiError(503, message, [], undefined, req);
  }

  // 500 - Database Error
  static DatabaseError(
    message: string = "Ошибка базы данных",
    req?: Request,
  ): ApiError {
    return new ApiError(500, message, [], undefined, req);
  }

  // Универсальный метод
  static create(
    status: number,
    message: string,
    errors: any[] = [],
    data?: any,
    req?: Request,
  ): ApiError {
    return new ApiError(status, message, errors, data, req);
  }
}

export default ApiError;
