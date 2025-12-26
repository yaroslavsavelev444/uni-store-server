const express = require("express");
const router = express.Router();
const wishlistController = require("../controllers/wishlistController");
const wishlistValidators = require("../validators/wishlist.validator");
const authMiddleware = require("../middlewares/auth-middleware");

// Все роуты требуют авторизации
router.use(authMiddleware(["all"]));

// Основные операции с избранным
router.get("/", wishlistController.getWishlist);                    // Получить все товары из избранного
router.get("/paginated", wishlistController.getPaginated);         // Получить с пагинацией
router.get("/summary", wishlistController.getSummary);             // Получить сводку
router.get("/count", wishlistController.getCount);                 // Получить количество
router.get("/ids", wishlistController.getProductIds);              // Получить ID товаров
router.get("/check/:productId", wishlistController.isInWishlist);  // Проверить, есть ли товар в избранном

router.post("/items", wishlistValidators.addOrRemoveProduct, wishlistController.addProduct); // Добавить товар
router.delete("/items/:productId", wishlistController.removeProduct); // Удалить товар
router.post("/toggle", wishlistValidators.addOrRemoveProduct, wishlistController.toggleProduct); // Переключить товар
router.delete("/", wishlistController.clearWishlist);              // Очистить избранное

module.exports = router;