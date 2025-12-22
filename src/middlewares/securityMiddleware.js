const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// 🔐 Настройки безопасности
const logOnly = false;

// 🧱 Блокируем опасные URL-шаблоны
const forbiddenPatterns = [
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
  /\/wp\-includes\//i,
  /\/wp\-content\//i,
  /\/wp\-admin\//i,
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
  /\/\//,
  /\.\.\//,             // Directory traversal
  /%2e%2e%2f/i,         // URL-encoded ../
];

// Middleware для блокировки по шаблонам
const safeAdminPatterns = [
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

  /^\/admin\/uploadPromoBlock$/,
  /^\/admin\/updatePromoBlock\/[^/]+$/,
  /^\/admin\/deletePromoBlock\/[^/]+$/,
  /^\/admin\/uploadMainMaterial$/,
  /^\/admin\/updateMainMaterial\/[^/]+$/,
  /^\/admin\/deleteMainMaterial\/[^/]+$/,
];

function forbiddenRequestBlocker(req, res, next) {
  const isSafeAdminPath = safeAdminPatterns.some(pattern => pattern.test(req.path));

  if (isSafeAdminPath) {
    return next(); // Разрешаем безопасные админские пути
  }

  const isForbidden = forbiddenPatterns.some(pattern => pattern.test(req.url));

  if (isForbidden) {
    const log = {
      time: new Date().toISOString(),
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    console.warn('[SECURITY] Forbidden request detected:', log);

    if (!logOnly) {
      return res.status(403).send('Forbidden');
    }
  }

  next();
}

// 🚀 Rate limiting — жёсткое ограничение
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100,                 // 100 запросов с одного IP за окно
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

// 🐌 Замедление при превышении лимита
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 минут
  delayAfter: 50,           // После 50 запросов в окне — замедлять
  delayMs: 500,             // Увеличивать задержку на 500мс за каждый лишний запрос
});

module.exports = {
  securityMiddleware: forbiddenRequestBlocker,
  rateLimiter: limiter,
  speedLimiter,
};