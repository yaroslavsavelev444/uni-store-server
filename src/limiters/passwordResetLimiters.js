// middlewares/passwordResetLimiters.js
import {
  createIpRateLimiter,
  createRedisRateLimiter,
} from "../middlewares/rateLimit";

// Базовые IP лимитеры
const ipLimiter = createIpRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: "Слишком много запросов с вашего IP-адреса",
});

const strictIpLimiter = createIpRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: "Слишком много запросов с вашего IP-адреса",
});

// 🔐 Лимитеры для процесса восстановления пароля

// Инициация восстановления пароля
const initiatePasswordResetLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:initiate",
  windowSec: 900, // 15 минут
  getMax: (req) => 3,
  getKey: (req) =>
    req.body.email
      ? `email:${req.body.email.toLowerCase().trim()}`
      : `ip:${req.ip}`,
  message:
    "Слишком много запросов на восстановление пароля. Попробуйте через 15 минут.",
});

// Верификация кода восстановления
const verifyPasswordResetCodeLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:verify_code",
  windowSec: 300, // 5 минут
  getMax: (req) => 5,
  getKey: (req) =>
    req.body.email
      ? `email:${req.body.email.toLowerCase().trim()}`
      : `ip:${req.ip}`,
  message: "Слишком много попыток верификации кода. Попробуйте через 5 минут.",
});

// Завершение восстановления пароля
const completePasswordResetLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:complete",
  windowSec: 600, // 10 минут
  getMax: (req) => 3,
  getKey: (req) =>
    req.body.email
      ? `email:${req.body.email.toLowerCase().trim()}`
      : `ip:${req.ip}`,
  message: "Слишком много попыток смены пароля. Попробуйте через 10 минут.",
});

// Общий лимитер для всего процесса восстановления
const passwordResetProcessLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:process",
  windowSec: 3600, // 1 час
  getMax: (req) => 5,
  getKey: (req) =>
    req.body.email
      ? `email:${req.body.email.toLowerCase().trim()}`
      : `ip:${req.ip}`,
  message: "Слишком много попыток восстановления пароля. Попробуйте через час.",
});

// Повторная отправка кода восстановления
const resendPasswordResetCodeLimiter = createRedisRateLimiter({
  keyPrefix: "password_reset:resend",
  windowSec: 300, // 5 минут
  getMax: (req) => 2,
  getKey: (req) =>
    req.body.email
      ? `email:${req.body.email.toLowerCase().trim()}`
      : `ip:${req.ip}`,
  message:
    "Слишком много запросов на повторную отправку кода. Попробуйте через 5 минут.",
});

export default {
  ipLimiter,
  strictIpLimiter,
  initiatePasswordResetLimiter,
  verifyPasswordResetCodeLimiter,
  completePasswordResetLimiter,
  passwordResetProcessLimiter,
  resendPasswordResetCodeLimiter,
};
