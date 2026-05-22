import type { Request } from "express";

export interface ApiErrorResponse {
  message: string;
  errors?: any[];
  timestamp: string;
  errorId?: string;
  stack?: string;
  // Дополнительные динамические поля (code, blockedUntil и т.д.)
  [key: string]: any;
}

export interface ApiErrorConstructor {
  status: number;
  message: string;
  errors?: any[];
  requestContext?: Request | null;
}

export type ErrorType =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_SERVER_ERROR"
  | "GATEWAY_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "DATABASE_ERROR"
  | "CUSTOM_ERROR";

export interface ErrorLogData {
  errorType: string;
  message: string;
  statusCode: number;
  errors?: any[];
  name: string;
  stack?: string;
}

export interface RequestContext {
  ip: string;
  endpoint: string;
  method: string;
  userAgent: string;
  userId: string | "anonymous";
  userRole: string | "guest";
  query?: any;
  params?: any;
  body?: any;
  timestamp: string;
  requestId: string;
  errorInContext?: string;
}

export interface ValidationError {
  field?: string;
  message: string;
  [key: string]: any;
}
