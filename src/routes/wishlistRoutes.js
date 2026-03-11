import { Router } from "express";

const router = Router();

import wishlistController from "../controllers/wishlistController";
import authMiddleware from "../middlewares/auth-middleware";
import { addOrRemoveProduct } from "../validators/wishlist.validator";

// Все роуты требуют авторизации
router.use(authMiddleware(["all"]));

// Основные операции с избранным
router.get("/", wishlistController.getWishlist); // Получить все товары из избранного
router.get("/paginated", wishlistController.getPaginated); // Получить с пагинацией
router.get("/summary", wishlistController.getSummary); // Получить сводку
router.get("/count", wishlistController.getCount); // Получить количество
router.get("/ids", wishlistController.getProductIds); // Получить ID товаров
router.get("/check/:productId", wishlistController.isInWishlist); // Проверить, есть ли товар в избранном

router.post("/items", addOrRemoveProduct, wishlistController.addProduct); // Добавить товар
router.delete("/items/:productId", wishlistController.removeProduct); // Удалить товар
router.post("/toggle", addOrRemoveProduct, wishlistController.toggleProduct); // Переключить товар
router.delete("/", wishlistController.clearWishlist); // Очистить избранное

export default router;
