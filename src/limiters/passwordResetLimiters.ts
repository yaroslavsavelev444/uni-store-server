// limiters/passwordResetLimiters.ts
import type { Request } from "express";
import {
  createIpRateLimiter,
  createRedisRateLimiter,
} from "../middlewares/rateLimit.js";

// Базовые IP лимитеры
export const ipLimiter = createIpRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: "Слишком много запросов с вашего IP-адреса",
});

export const strictIpLimiter = createIpRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: "Слишком много запросов с вашего IP-адреса",
});

// 🔐 Лимитеры для процесса восстановления пароля

// Инициация восстановления пароля
export const initiatePasswordResetLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:initiate",
  windowSec: 900, // 15 минут
  getMax: (_req: Request) => 3,
  getKey: (req: Request) => {
    const email = req.body?.email;
    return email
      ? `email:${String(email).toLowerCase().trim()}`
      : `ip:${req.ip || "unknown"}`;
  },
  message:
    "Слишком много запросов на восстановление пароля. Попробуйте через 15 минут.",
});

// Верификация кода восстановления
export const verifyPasswordResetCodeLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:verify_code",
  windowSec: 300, // 5 минут
  getMax: (_req: Request) => 5,
  getKey: (req: Request) => {
    const email = req.body?.email;
    return email
      ? `email:${String(email).toLowerCase().trim()}`
      : `ip:${req.ip || "unknown"}`;
  },
  message: "Слишком много попыток верификации кода. Попробуйте через 5 минут.",
});

// Завершение восстановления пароля
export const completePasswordResetLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:complete",
  windowSec: 600, // 10 минут
  getMax: (_req: Request) => 3,
  getKey: (req: Request) => {
    const email = req.body?.email;
    return email
      ? `email:${String(email).toLowerCase().trim()}`
      : `ip:${req.ip || "unknown"}`;
  },
  message: "Слишком много попыток смены пароля. Попробуйте через 10 минут.",
});

// Общий лимитер для всего процесса восстановления
export const passwordResetProcessLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:process",
  windowSec: 3600, // 1 час
  getMax: (_req: Request) => 5,
  getKey: (req: Request) => {
    const email = req.body?.email;
    return email
      ? `email:${String(email).toLowerCase().trim()}`
      : `ip:${req.ip || "unknown"}`;
  },
  message: "Слишком много попыток восстановления пароля. Попробуйте через час.",
});

// Повторная отправка кода восстановления
export const resendPasswordResetCodeLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:resend",
  windowSec: 300, // 5 минут
  getMax: (_req: Request) => 2,
  getKey: (req: Request) => {
    const email = req.body?.email;
    return email
      ? `email:${String(email).toLowerCase().trim()}`
      : `ip:${req.ip || "unknown"}`;
  },
  message:
    "Слишком много запросов на повторную отправку кода. Попробуйте через 5 минут.",
});
