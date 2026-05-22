const rateLimit = require('express-rate-limit');

// Ограничение: максимум 5 запросов в час
const contactFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5, // максимум 5 запросов
  message: {
    status: 429,
    error: "Слишком много попыток. Повторите через час.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Используем user ID, если есть, иначе IP
    return req.user?.id || req.ip;
  },
});

module.exports = { contactFormLimiter };