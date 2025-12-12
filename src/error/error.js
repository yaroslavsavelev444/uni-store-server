// middlewares/error-middleware.js
const ApiError = require('../exceptions/api-error');
const ErrorLogger = require('../logger/ErrorLogger');
const logger = require('../logger/logger');

module.exports = (err, req, res, next) => {
    // Для ApiError логирование уже выполнено в конструкторе
    if (err instanceof ApiError) {
        logger.info(`Returning API error: ${err.status} - ${err.message}`);
        return res.status(err.status).json({ 
            message: err.message, 
            errors: err.errors,
            timestamp: new Date().toISOString()
        });
    }
    
    // Для непредвиденных ошибок
    ErrorLogger.logUnexpectedError(err, req);
    
    // В продакшене показываем общее сообщение
    const isProduction = process.env.NODE_ENV === 'production';
    
    return res.status(500).json({
        message: isProduction 
            ? 'Непредвиденная ошибка сервера' 
            : err.message,
        errorId: req.id || ErrorLogger.generateRequestId(),
        timestamp: new Date().toISOString(),
        ...(isProduction ? {} : { stack: err.stack })
    });
};