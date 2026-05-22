// src/middlewares/auditRequestMiddleware.ts
/** biome-ignore-all lint/correctness/noVoidTypeReturn: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
/** biome-ignore-all lint/correctness/noUnusedVariables: <explanation> */
import type { NextFunction, Request, Response } from "express";
import auditLogger from "../logger/auditLogger.js";
import type { AuditConfig, RequestCategory, UserType } from "../types/audit.js";

type LogLevel = "info" | "warn" | "error";

/**
 * Get client IP from request
 */
const getClientIp = (req: Request): string => {
  return (
    req.ip ||
    (req.headers["x-forwarded-for"] as string) ||
    (req.headers["x-real-ip"] as string) ||
    req.socket.remoteAddress ||
    "unknown"
  );
};

/**
 * Clean sensitive data from request body
 */
const sanitizeBody = (body: any): any => {
  if (!body || typeof body !== "object") {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields: string[] = [
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
    "mobile",
  ];

  const sanitizeObject = (obj: any): any => {
    if (!obj || typeof obj !== "object") return obj;

    Object.keys(obj).forEach((key) => {
      if (sensitiveFields.includes(key)) {
        obj[key] = "***REDACTED***";
      } else if (obj[key] && typeof obj[key] === "object") {
        obj[key] = sanitizeObject(obj[key]);
      }
    });

    return obj;
  };

  return sanitizeObject(sanitized);
};

/**
 * Determine user type by role
 */
const getUserType = (user?: any): UserType => {
  if (!user) return "guest";
  if (user.role === "admin" || user.role === "superadmin") return "admin";
  if (user.role === "moderator") return "moderator";
  return "user";
};

/**
 * Check if path is public (doesn't require audit)
 */
const isPublicPath = (path: string): boolean => {
  const publicPaths: string[] = [
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
    (publicPath) => path === publicPath || path.startsWith(publicPath),
  );
};

/**
 * Check if path is admin path
 */
const isAdminPath = (path: string): boolean => {
  const adminPaths: string[] = [
    "/admin/",
    "/api/admin/",
    "/management/",
    "/dashboard/",
  ];

  return adminPaths.some((adminPath) => path.startsWith(adminPath));
};

/**
 * Get request category based on HTTP method
 */
const getRequestCategory = (method: string, path: string): RequestCategory => {
  const methodType = method.toUpperCase();

  if (
    methodType === "POST" &&
    !path.includes("/search") &&
    !path.includes("/filter")
  ) {
    return "CREATE";
  }

  if (methodType === "GET" || methodType === "HEAD") {
    return "READ";
  }

  if (methodType === "PUT" || methodType === "PATCH") {
    return "UPDATE";
  }

  if (methodType === "DELETE") {
    return "DELETE";
  }

  return "OTHER";
};

/**
 * Safe JSON parsing
 */
const safeJsonParse = (str: string): any | null => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

/**
 * Log suspicious activity
 */
const logSuspiciousActivity = (
  req: Request,
  statusCode: number,
  clientIp: string,
): void => {
  const suspiciousPaths: string[] = [
    "/admin",
    "/login",
    "/api/auth",
    "/api/admin",
    "/api/payment",
    "/api/users",
  ];

  const isSuspiciousPath = suspiciousPaths.some((path) =>
    req.path.includes(path),
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
 * Main audit request middleware
 */
const auditRequestMiddleware = (options: Partial<AuditConfig> = {}) => {
  const config: AuditConfig = {
    logRequestBody: false,
    maxBodySize: 1024 * 10, // 10KB
    ignorePaths: [],
    logMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    includeUserAgent: true,
    includeReferer: true,
    slowRequestThreshold: 1000,
    logSuccess: true,
    logClientErrors: true,
    logServerErrors: true,
    ...options,
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip public paths
    if (isPublicPath(req.path)) {
      return next();
    }

    // Skip ignored paths
    if (config.ignorePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Skip non-logged methods
    if (
      config.logMethods &&
      !config.logMethods.includes(req.method.toUpperCase())
    ) {
      return next();
    }

    const startTime: number = Date.now();
    const clientIp: string = getClientIp(req);
    const requestId: string =
      req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save request metadata for post-completion use
    req._auditMetadata = {
      startTime,
      clientIp,
      requestId,
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
    };

    // Log request start (for long operations)
    if (config.logRequestBody && req.body && Object.keys(req.body).length > 0) {
      const bodySize: number = JSON.stringify(req.body).length;
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

    // Capture response for logging
    const originalEnd = res.end;
    const responseBodyChunks: Buffer[] = [];

    res.end = function (chunk?: any, encoding?: any, callback?: any): any {
      if (chunk) {
        responseBodyChunks.push(Buffer.from(chunk));
      }

      // Log request completion after response is sent
      setImmediate(() => {
        const duration: number = Date.now() - startTime;
        const statusCode: number = res.statusCode;
        const isError: boolean = statusCode >= 400;
        const isClientError: boolean = statusCode >= 400 && statusCode < 500;
        const isServerError: boolean = statusCode >= 500;
        const isSlow: boolean = duration > config.slowRequestThreshold;

        // Determine if we should log this request
        let shouldLog: boolean = false;

        if (isServerError && config.logServerErrors) {
          shouldLog = true;
        } else if (isClientError && config.logClientErrors) {
          shouldLog = true;
        } else if (!isError && config.logSuccess) {
          shouldLog = true;
        }

        if (shouldLog || isSlow) {
          // Collect log data
          const logData: any = {
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
              ? ((req.headers.referer || req.headers.referrer) as string)
              : undefined,
            query:
              Object.keys(req.query || {}).length > 0 ? req.query : undefined,
            params:
              Object.keys(req.params || {}).length > 0 ? req.params : undefined,
            timestamp: new Date().toISOString(),
          };

          // Add response body for errors (limited)
          if (isError && responseBodyChunks.length > 0) {
            try {
              const responseBody: string =
                Buffer.concat(responseBodyChunks).toString("utf8");
              if (responseBody.length < 500) {
                const parsed = safeJsonParse(responseBody);
                logData.response = parsed || responseBody.substring(0, 200);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }

          // Determine log level
          let logLevel: LogLevel = "info";
          if (isServerError) logLevel = "error";
          else if (isClientError) logLevel = "warn";

          // Log to appropriate logger (type-safe dynamic dispatch)
          const accessLogger = auditLogger.loggers.access;
          if (logLevel === "error") {
            accessLogger.error(logData);
          } else if (logLevel === "warn") {
            accessLogger.warn(logData);
          } else {
            accessLogger.info(logData);
          }

          // Additional logging for slow requests
          if (isSlow) {
            auditLogger.loggers.app.warn({
              event: "SLOW_REQUEST",
              ...logData,
              threshold: `${config.slowRequestThreshold}ms`,
            });
          }

          // Log admin actions separately
          if (isAdminPath(req.path) && req.user) {
            const action: RequestCategory = getRequestCategory(
              req.method,
              req.path,
            );
            const event: string = isError
              ? "ADMIN_REQUEST_ERROR"
              : "ADMIN_REQUEST";

            auditLogger.logAdminEvent(
              req.user.id,
              req.user.email,
              req.user.role,
              event,
              action,
              null,
              [],
              `${req.method} ${req.path} - ${statusCode} (${duration}ms)`,
            );
          }

          // Log user actions for important operations
          if (req.user && !isAdminPath(req.path)) {
            const importantPaths: string[] = [
              "/api/auth/",
              "/api/profile/",
              "/api/payment/",
              "/api/orders/",
              "/api/settings/",
            ];

            const isImportant: boolean = importantPaths.some((path) =>
              req.path.startsWith(path),
            );
            const isWriteOperation: boolean = [
              "POST",
              "PUT",
              "PATCH",
              "DELETE",
            ].includes(req.method.toUpperCase());

            if ((isImportant || isWriteOperation) && !isError) {
              const action: RequestCategory = getRequestCategory(
                req.method,
                req.path,
              );
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
                },
              );
            }
          }

          // Log suspicious activity
          if (statusCode === 401 || statusCode === 403) {
            logSuspiciousActivity(req, statusCode, clientIp);
          }
        }
      });

      return originalEnd.call(this, chunk, encoding, callback);
    };

    // Error handling
    req.on("error", (err: Error) => {
      const duration: number = Date.now() - startTime;

      auditLogger.loggers.error.error({
        requestId,
        event: "REQUEST_ERROR",
        method: req.method,
        path: req.path,
        ip: clientIp,
        userId: req.user?.id,
        error: err.message,
        stack: err.stack?.split("\n").slice(0, 5).join("\n"),
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
    });

    next();
  };
};

export default auditRequestMiddleware;

// Export helper functions for testing
export const helpers = {
  getClientIp,
  sanitizeBody,
  getUserType,
  isPublicPath,
  isAdminPath,
  getRequestCategory,
  safeJsonParse,
};
