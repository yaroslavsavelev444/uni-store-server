// middlewares/rateLimit.js
const redisClient = require("../redis/redis.client");
const logger = require("../logger/logger");
const ApiError = require("../exceptions/api-error");
const { default: rateLimit } = require("express-rate-limit");
const createIpRateLimiter = ({ windowMs = 60_000, max = 10, message }) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: message || "Слишком много запросов с вашего IP" });
    },
  });
};

/**
 * Redis rate limiter
 * @param {Object} options
 * @param {string} options.keyPrefix - Префикс ключа в Redis
 * @param {number} options.windowSec - Время окна в секундах
 * @param {function} [options.getMax] - Функция, которая возвращает max лимит для ключа (email/userId)
 */
const createRedisRateLimiter = ({ keyPrefix, windowSec = 60, getMax }) => {
  return async (req, res, next) => {
    try {
      const keyValue = req.body.email?.toLowerCase().trim() || req.body.userId?.toLowerCase().trim();
      if (!keyValue) return next();

      const key = `${keyPrefix}:${keyValue}`;

      // Определяем лимит
      const max = typeof getMax === "function" ? getMax(req) : 5;

      // Атомарный инкремент + установка TTL при первом использовании
      const current = await redisClient.client.incr(key);
      if (current === 1) {
        await redisClient.expire(key, windowSec);
      }

      // Проверка превышения
      if (current > max) {
        const ttl = await redisClient.client.ttl(key); // сколько секунд до сброса
        logger.warn(`[RATE LIMIT] ${key} превысил лимит (${current}/${max}). Retry after ${ttl}s`);
        return res.status(429).json({
          error: "Слишком много попыток. Попробуйте позже.",
          retryAfter: ttl,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { createRedisRateLimiter, createIpRateLimiter };