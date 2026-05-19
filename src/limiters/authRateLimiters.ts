import type { Request } from "express";
import rateLimit from "express-rate-limit";

// Базовые настройки
const standardLimiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skip: (req: Request) => req.method !== "POST", // лимитируем только POST-запросы
  });

// Лимитеры для различных эндпоинтов
export const loginLimiter = standardLimiter(
  15 * 60 * 1000, // 15 минут
  5, // максимум 5 попыток
  "Слишком много попыток входа. Попробуйте позже.",
);

export const registerLimiter = standardLimiter(
  60 * 60 * 1000, // 1 час
  3, // 3 регистрации с одного IP
  "Слишком много регистраций. Попробуйте позже.",
);

export const passwordResetLimiter = standardLimiter(
  15 * 60 * 1000, // 15 минут
  3,
  "Слишком много запросов на сброс пароля.",
);

export const twoFALimiter = standardLimiter(
  10 * 60 * 1000, // 10 минут
  5,
  "Слишком много попыток ввода 2FA кода.",
);

// Общий лимитер для публичных эндпоинтов
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 30,
  message: { success: false, message: "Слишком много запросов, подождите." },
});
