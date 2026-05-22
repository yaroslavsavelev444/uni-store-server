// exceptions/api-error.js
const ErrorLogger = require('../logger/ErrorLogger');

module.exports = class ApiError extends Error {
    constructor(status, message, errors = [], requestContext = null) {
        super(message);
        this.status = status;
        this.errors = errors;
        this.requestContext = requestContext;
        
        // Автоматически логируем создание ошибки если есть контекст
        if (requestContext) {
            ErrorLogger.logApiError(this, requestContext, 'API_ERROR_CREATED');
        }
    }

    // 400 - Неверный запрос
    static BadRequest(message, errors = [], req = null) {
        const error = new ApiError(400, message, errors, req);
        ErrorLogger.logApiError(error, req, 'BAD_REQUEST');
        return error;
    }

    // 401 - Не авторизован
    static UnauthorizedError(req = null) {
        const error = new ApiError(401, "Пользователь не авторизован", [], req);
        ErrorLogger.logApiError(error, req, 'UNAUTHORIZED');
        return error;
    }

    // 403 - Доступ запрещен
    static ForbiddenError(message = "Доступ запрещен", req = null) {
        const error = new ApiError(403, message, [], req);
        ErrorLogger.logApiError(error, req, 'FORBIDDEN');
        return error;
    }

    // 404 - Объект не найден
    static NotFoundError(message = "Объект не найден", req = null) {
        const error = new ApiError(404, message, [], req);
        ErrorLogger.logApiError(error, req, 'NOT_FOUND');
        return error;
    }

    // 409 - Конфликт
    static ConflictError(message = "Конфликт данных", req = null) {
        const error = new ApiError(409, message, [], req);
        ErrorLogger.logApiError(error, req, 'CONFLICT');
        return error;
    }

    // 422 - Ошибка валидации
    static ValidationError(errors = [], req = null) {
        const error = new ApiError(422, "Ошибка валидации", errors, req);
        ErrorLogger.logValidationError(errors, req);
        return error;
    }

    // 429 - Слишком много запросов
    static TooManyRequestsError(message = "Слишком много запросов", req = null) {
        const error = new ApiError(429, message, [], req);
        ErrorLogger.logApiError(error, req, 'RATE_LIMIT_EXCEEDED');
        return error;
    }

    // 500 - Внутренняя ошибка сервера
    static InternalServerError(message = "Внутренняя ошибка сервера", req = null) {
        const safeMessage = typeof message === 'string' 
            ? message 
            : JSON.stringify(message);
        
        const error = new ApiError(500, safeMessage, [], req);
        ErrorLogger.logUnexpectedError(error, req);
        return error;
    }

    // 502 - Ошибка шлюза
    static GatewayError(message = "Ошибка шлюза", req = null) {
        const error = new ApiError(502, message, [], req);
        ErrorLogger.logApiError(error, req, 'GATEWAY_ERROR');
        return error;
    }

    // 503 - Сервис недоступен
    static ServiceUnavailableError(message = "Сервис временно недоступен", req = null) {
        const error = new ApiError(503, message, [], req);
        ErrorLogger.logApiError(error, req, 'SERVICE_UNAVAILABLE');
        return error;
    }

    // 500 - Ошибка базы данных
    static DatabaseError(message = "Ошибка базы данных", req = null) {
        const error = new ApiError(500, message, [], req);
        ErrorLogger.logApiError(error, req, 'DATABASE_ERROR');
        return error;
    }

    // Метод для создания ошибки с произвольным кодом
    static create(status, message, errors = [], req = null) {
        const error = new ApiError(status, message, errors, req);
        ErrorLogger.logApiError(error, req, 'CUSTOM_ERROR');
        return error;
    }
};