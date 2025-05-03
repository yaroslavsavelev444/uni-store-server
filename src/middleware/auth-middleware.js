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

        if (userData == null) {
            return next(ApiError.UnauthorizedError());
        }
        if(userData !== null){
            console.log("Все норм мидлварина пропускает")
            req.user = userData;
            next();
        }
        
    } catch (e) {
        return next(ApiError.UnauthorizedError());
    }
};
