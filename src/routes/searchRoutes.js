const router = require("express").Router();
const searchController = require("../controllers/searchController");
const authMiddleware = require("../middlewares/auth-middleware");
// const validateQueryParams = require("../middlewares/validateQueryParams");
router.get("/getHints", searchController.getHints);

// Поиск продуктов с валидацией query параметров
router.get(
  "/search",
//   validateQueryParams(productSearchSchema),
  searchController.searchProducts
);

// Все маршруты требуют аутентификации
router.use(authMiddleware(["all"]));

// История поиска
router.post("/saveSearchHistory", searchController.saveSearchHistory);
router.get("/getSearchHistory", searchController.getSearchHistory);
router.post("/clearSearchHistory", searchController.clearSearchHistory);


module.exports = router;