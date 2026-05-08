const router = require("express").Router();

import searchController from "../controllers/searchController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// const validateQueryParams = require("../middlewares/validateQueryParams");
router.get("/getHints", searchController.getHints);

// Поиск продуктов с валидацией query параметров
router.get(
	"/search",
	//   validateQueryParams(productSearchSchema),
	searchController.searchProducts,
);

// Все маршруты требуют аутентификации
router.use(authMiddleware(["all"]));

// История поиска
router.post("/saveSearchHistory", searchController.saveSearchHistory);
router.get("/getSearchHistory", searchController.getSearchHistory);
router.post("/clearSearchHistory", searchController.clearSearchHistory);

export default router;
