import type { NextFunction, Request, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import ErrorLogger from "../logger/ErrorLogger.js";
import type { ApiErrorResponse } from "../types/error.js";

const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void => {
  ErrorLogger.logError(err, req);

  let statusCode = 500;
  let message = "Внутренняя ошибка сервера";
  let errors: any[] = [];
  let data: any;

  if (err instanceof ApiError) {
    statusCode = err.status;
    message = err.message;
    errors = err.errors || [];
    data = err.data; // ← получаем дополнительные данные
  } else if (err instanceof Error) {
    if (process.env.NODE_ENV !== "production") {
      message = err.message;
    }
  }

  const response: ApiErrorResponse = {
    message,
    errors,
    timestamp: new Date().toISOString(),
    ...((req as any).id ? { errorId: (req as any).id } : {}),
  };

  // ← Добавляем дополнительные поля из data в корень ответа
  if (data && typeof data === "object") {
    Object.assign(response, data);
  }

  if (err instanceof ApiError && err.data?.errorCode) {
    response.errorCode = err.data.errorCode;
    response.errorType = err.data.errorType;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    !(err instanceof ApiError) &&
    err.stack
  ) {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
};

export default errorHandler;
