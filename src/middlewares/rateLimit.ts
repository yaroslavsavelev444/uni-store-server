// middlewares/rateLimit.ts
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import redisClient from "../redis/redis.client.js";
import type {
  RateLimitOptions,
  RateLimitResponse,
  RedisRateLimiterOptions,
} from "../types/rateLimit.js";

// Локальное расширение Request для удобной работы с body
type RequestWithBody = Request & {
  body: {
    email?: string;
    userId?: string;
    [key: string]: unknown;
  };
};

/**
 * Создает IP-based rate limiter
 * @param options - Опции rate limiter
 * @returns Express middleware
 */
export const createIpRateLimiter = ({
  windowMs = 60_000,
  max = 10,
  message,
}: RateLimitOptions = {}) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      const response: RateLimitResponse = {
        error: message || "Слишком много запросов с вашего IP",
      };
      res.status(429).json(response);
    },
  });
};

/**
 * Redis rate limiter
 * @param options - Опции Redis rate limiter
 * @returns Express middleware
 */
export const createRedisRateLimiter = ({
  keyPrefix,
  windowSec = 60,
  getMax,
}: RedisRateLimiterOptions) => {
  return async (
    req: RequestWithBody,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const keyValue =
        req.body.email?.toLowerCase().trim() ||
        req.body.userId?.toLowerCase().trim();

      if (!keyValue) {
        return next();
      }

      const key = `${keyPrefix}:${keyValue}`;

      // Определяем лимит
      const max = typeof getMax === "function" ? getMax(req) : 5;

      // Атомарный инкремент + установка TTL при первом использовании
      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, windowSec);
      }

      // Проверка превышения
      if (current > max) {
        const ttl = await redisClient.ttl(key);
        logger.warn(
          `[RATE LIMIT] ${key} превысил лимит (${current}/${max}). Осталось ${ttl}s`,
        );

        const response: RateLimitResponse = {
          error: "Слишком много попыток. Попробуйте позже.",
          retryAfter: ttl,
        };

        res.status(429).json(response);
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
