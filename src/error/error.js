// middlewares/error-middleware.js
import ApiError from "../exceptions/api-error.js";
import { generateRequestId, logUnexpectedError } from "../logger/ErrorLogger.js";
import logger from "../logger/logger.js";

export default (err, req, res, _next) => {
	// Для ApiError логирование уже выполнено в конструкторе
	if (err instanceof ApiError) {
		logger.info(`Returning API error: ${err.status} - ${err.message}`);
		return res.status(err.status).json({
			message: err.message,
			errors: err.errors,
			timestamp: new Date().toISOString(),
		});
	}

	// Для непредвиденных ошибок
	logUnexpectedError(err, req);

	// В продакшене показываем общее сообщение
	const isProduction = process.env.NODE_ENV === "production";

	return res.status(500).json({
		message: isProduction ? "Непредвиденная ошибка сервера" : err.message,
		errorId: req.id || generateRequestId(),
		timestamp: new Date().toISOString(),
		...(isProduction ? {} : { stack: err.stack }),
	});
};
