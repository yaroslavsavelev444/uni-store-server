import type { NextFunction, RequestHandler } from "express";
import rateLimit, {
  type IncrementResponse,
  type Options as RateLimitOptions,
} from "express-rate-limit";
import slowDown, { type Options as SlowDownOptions } from "express-slow-down";

// 🔐 Настройки безопасности
const logOnly: boolean = false;

// 🧱 Блокируем опасные URL-шаблоны
const forbiddenPatterns: RegExp[] = [
  /\.env/i,
  /\.git/i,
  /docker-compose\.ya?ml/i,
  /\.config\.(js|json)$/i,
  /\.log$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.crt$/i,
  /\.sh$/i,
  /\.bash/i,

  // WordPress + распространённые сканируемые пути
  /\/wp-includes\//i,
  /\/wp-content\//i,
  /\/wp-admin\//i,
  /\/wordpress\//i,
  /\/xmlrpc\.php/i,
  /\/wlwmanifest\.xml/i,
  /\/license\.txt/i,
  /\/readme\.html/i,

  // Другие CMS и уязвимые панели
  /\/phpmyadmin/i,
  /\/pma/i,
  /\/mysql/i,
  /\/admin(\/|$)/i,
  /\/backup/i,
  /\/config/i,
  /\/shell/i,
  /\/console/i,

  // Подозрительные URL-структуры
  /\//,
  /\.\.\//, // Directory traversal
  /%2e%2e%2f/i, // URL-encoded ../
];

// ✅ Безопасные админские пути (разрешённые паттерны)
const safeAdminPatterns: RegExp[] = [
  /^\/admin\/addProduct$/,
  /^\/admin\/editProduct\/[^/]+$/,
  /^\/admin\/deleteProduct$/,

  /^\/admin\/addCategory$/,
  /^\/admin\/editCategory\/[^/]+$/,
  /^\/admin\/deleteCategory\/[^/]+$/,
  /^\/admin\/changeCategoryData$/,
  /^\/admin\/clearCategory$/,

  /^\/admin\/addOrgData$/,
  /^\/admin\/editOrgData$/,
  /^\/admin\/deleteOrgData\/[^/]+$/,
  /^\/admin\/uploadOrgFiles\/[^/]+$/,
  /^\/admin\/deleteOrgFile\/[^/]+$/,
  /^\/admin\/addOrgSocialLinks\/[^/]+$/,
  /^\/admin\/deleteSocialLink$/,

  /^\/admin\/toggleAdminRules$/,
  /^\/admin\/getUsers$/,
  /^\/admin\/deleteUser$/,

  /^\/admin\/getProductReviews$/,
  /^\/admin\/updateReviewStatus\/[^/]+$/,

  /^\/admin\/getContacts$/,
  /^\/admin\/updateContactStatus$/,

  /^\/admin\/getOrders$/,
  /^\/admin\/cancelOrder$/,
  /^\/admin\/updateOrderStatus$/,
  /^\/admin\/uploadOrderFile\/[^/]+$/,
  /^\/admin\/deleteOrderFile\/[^/]+$/,
  /^\/admin\/deleteUploadedFile$/,
];

// Тип для лога подозрительного запроса
interface SecurityLog {
  time: string;
  method: string;
  url: string;
  ip: string;
  userAgent: string | undefined;
}

// Middleware для блокировки по шаблонам
export const securityMiddleware: RequestHandler = (req, res, next) => {
  const isSafeAdminPath = safeAdminPatterns.some((pattern) =>
    pattern.test(req.path),
  );

  if (isSafeAdminPath) {
    return next(); // Разрешаем безопасные админские пути
  }

  const isForbidden = forbiddenPatterns.some((pattern) =>
    pattern.test(req.url),
  );

  if (isForbidden) {
    const log: SecurityLog = {
      time: new Date().toISOString(),
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };

    console.warn("[SECURITY] Forbidden request detected:", log);

    if (!logOnly) {
      return res.status(403).send("Forbidden");
    }
  }

  next();
};

// 🚀 Rate limiting — жёсткое ограничение
const rateLimitOptions: RateLimitOptions = {
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов с одного IP за окно
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
  limit: 0,
  statusCode: 0,
  identifier: "",
  requestPropertyName: "",
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  keyGenerator: (
    request: Request,
    response: Response,
  ): string | Promise<string> => {
    throw new Error("Function not implemented.");
  },
  handler: (
    request: Request,
    response: Response,
    next: NextFunction,
    optionsUsed: RateLimitOptions,
  ): void => {
    throw new Error("Function not implemented.");
  },
  skip: (request: Request, response: Response): boolean | Promise<boolean> => {
    throw new Error("Function not implemented.");
  },
  requestWasSuccessful: (
    request: Request,
    response: Response,
  ): boolean | Promise<boolean> => {
    throw new Error("Function not implemented.");
  },
  store: {
    init: undefined,
    get: undefined,
    increment: (
      key: string,
    ): Promise<IncrementResponse> | IncrementResponse => {
      throw new Error("Function not implemented.");
    },
    decrement: (key: string): Promise<void> | void => {
      throw new Error("Function not implemented.");
    },
    resetKey: (key: string): Promise<void> | void => {
      throw new Error("Function not implemented.");
    },
    resetAll: undefined,
    shutdown: undefined,
    localKeys: undefined,
    prefix: undefined,
  },
  validate: false,
  passOnStoreError: false,
};

export const rateLimiter = rateLimit(rateLimitOptions);

// 🐌 Замедление при превышении лимита
const slowDownOptions: SlowDownOptions = {
  windowMs: 15 * 60 * 1000, // 15 минут
  delayAfter: 50, // После 50 запросов в окне — замедлять
  delayMs: 500, // Увеличивать задержку на 500мс за каждый лишний запрос
};

export const speedLimiter = slowDown(slowDownOptions);
