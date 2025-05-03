module.exports = class ApiError extends Error {
    constructor(status, message, errors = []) {
        super(message);
        this.status = status;
        this.errors = errors;
    }

    // 400 - Неверный запрос (валидация, некорректные данные)
    static BadRequest(message, errors = []) {
        console.error('ApiError.BadRequest' , message);
        return new ApiError(400, message, errors);
    }

    // 401 - Не авторизован
    static UnauthorizedError() {
        console.error('ApiError.UnauthorizedError');
        return new ApiError(401, "Пользователь не авторизован");
    }

    // 403 - Доступ запрещен
    static ForbiddenError(message = "Доступ запрещен") {
        console.error('ApiError.ForbiddenError' , message);
        return new ApiError(403, message);
    }

    // 404 - Объект не найден
    static NotFoundError(message = "Объект не найден") {
        console.error('ApiError.NotFoundError' , message);
        return new ApiError(404, message);
    }

    // 409 - Конфликт (например, email уже используется)
    static ConflictError(message = "Конфликт данных") {
        console.error('ApiError.ConflictError' , message);
        return new ApiError(409, message);
    }

    // 429 - Слишком много запросов (rate limit)
    static TooManyRequestsError(message = "Слишком много запросов") {
        console.error('ApiError.TooManyRequestsError' , message);
        return new ApiError(429, message);
    }

    // 500 - Внутренняя ошибка сервера (неожиданная ошибка)
    static InternalServerError(message = "Внутренняя ошибка сервера") {
        console.error('ApiError.InternalServerError' , message);
        return new ApiError(500, message);
    }

    // 502 - Ошибка прокси или баланса нагрузки
    static GatewayError(message = "Ошибка шлюза") {
        console.error('ApiError.GatewayError' , message);
        return new ApiError(502, message);
    }

    // 503 - Сервис недоступен (например, сервер перегружен)
    static ServiceUnavailableError(message = "Сервис временно недоступен") {
        console.error('ApiError.ServiceUnavailableError' , message);
        return new ApiError(503, message);
    }

    // 500 - Ошибка базы данных (специфичная внутренняя ошибка)
    static DatabaseError(message = "Ошибка базы данных") {
        console.error('ApiError.DatabaseError' , message);
        return new ApiError(500, message);
    }
};