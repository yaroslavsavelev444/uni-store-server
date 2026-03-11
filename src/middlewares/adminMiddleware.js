import { ForbiddenError, UnauthorizedError } from "../exceptions/api-error.js";
import { validateAccessToken } from "../services/tokenService.js";

export default async function (req, res, next) {
	try {
		const authorizationHeader = req.headers.authorization;
		if (!authorizationHeader) {
			return next(UnauthorizedError());
		}

		const accessToken = authorizationHeader.split(" ")[1];
		if (!accessToken) {
			return next(UnauthorizedError());
		}

		const userData = await validateAccessToken(accessToken);

		if (!userData) {
			return next(UnauthorizedError());
		}

		if (userData.role === "admin" || userData.role === "superadmin") {
			console.log("Доступ разрешён для роли:", userData.role);
			req.user = userData;
			return next();
		} else {
			return next(
				ForbiddenError("Доступ запрещен: требуется роль admin или superadmin"),
			);
		}
	} catch (e) {
		return next(UnauthorizedError());
	}
}
