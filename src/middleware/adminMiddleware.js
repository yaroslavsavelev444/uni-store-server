const tokenService = require('../services/tokenService');
const ApiError = require('../exceptions/api-error');

module.exports = async function (req, res, next) {
    try {
        const authorizationHeader = req.headers.authorization;
        if (!authorizationHeader) {
            return next(ApiError.UnauthorizedError());
        }

        const accessToken = authorizationHeader.split(' ')[1];
        if (!accessToken) {
            return next(ApiError.UnauthorizedError());
        }

        const userData = await tokenService.validateAccessToken(accessToken);

        if (!userData) {
            return next(ApiError.UnauthorizedError());
        }

        if (userData.role === 'admin' || userData.role === 'superadmin') {
            console.log("Доступ разрешён для роли:", userData.role);
            req.user = userData;
            return next();
        } else {
            return next(ApiError.ForbiddenError('Доступ запрещен: требуется роль admin или superadmin'));
        }

    } catch (e) {
        return next(ApiError.UnauthorizedError());
    }
};