// middlewares/request-context-middleware.js
const { v4: uuidv4 } = require('uuid');

/**
 * Middleware для добавления контекста к запросу
 */
const requestContextMiddleware = (req, res, next) => {
  // Генерируем уникальный ID запроса если его нет
  if (!req.id) {
    req.id = `req_${uuidv4()}`;
  }
  
  // Добавляем метку времени начала обработки
  req._startTime = process.hrtime();
  
  // Добавляем безопасные заголовки
  req.context = {
    requestId: req.id,
    ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    correlationId: req.headers['x-correlation-id'] || req.id
  };
  
  // Устанавливаем correlation ID в заголовки ответа
  res.setHeader('X-Request-ID', req.id);
  res.setHeader('X-Correlation-ID', req.context.correlationId);
  
  next();
};

module.exports = requestContextMiddleware;