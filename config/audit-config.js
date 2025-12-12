// config/audit-config.js
module.exports = {
  development: {
    logRequestBody: true,
    maxBodySize: 1024 * 5, // 5KB
    logSuccess: true,
    logClientErrors: true,
    logServerErrors: true,
    slowRequestThreshold: 500, // 0.5 секунды
    ignorePaths: ['/health', '/metrics']
  },
  
  staging: {
    logRequestBody: false,
    maxBodySize: 1024 * 2, // 2KB
    logSuccess: false, // Только ошибки в staging
    logClientErrors: true,
    logServerErrors: true,
    slowRequestThreshold: 1000, // 1 секунда
    ignorePaths: ['/health', '/metrics', '/static']
  },
  
  production: {
    logRequestBody: false,
    maxBodySize: 1024, // 1KB
    logSuccess: false, // Только ошибки в production
    logClientErrors: true,
    logServerErrors: true,
    slowRequestThreshold: 2000, // 2 секунды
    ignorePaths: ['/health', '/metrics', '/static', '/public', '/uploads'],
    logMethods: ['POST', 'PUT', 'PATCH', 'DELETE'] // Только модифицирующие запросы
  }
};