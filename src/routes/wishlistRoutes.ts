import { Router } from "express";

const router = Router();

import wishlistController from "../controllers/wishlistController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import wishlistValidators from "../validators/wishlist.validator.js";

// Все роуты требуют авторизации
router.use(authMiddleware.requireAuth);

// Основные операции с избранным
router.get("/", wishlistController.getWishlist as any); // Получить все товары из избранного
router.get("/paginated", wishlistController.getPaginated as any); // Получить с пагинацией
router.get("/summary", wishlistController.getSummary as any); // Получить сводку
router.get("/count", wishlistController.getCount as any); // Получить количество
router.get("/ids", wishlistController.getProductIds as any); // Получить ID товаров
router.get("/check/:productId", wishlistController.isInWishlist as any); // Проверить, есть ли товар в избранном

router.post(
  "/items",
  wishlistValidators.addOrRemoveProduct,
  wishlistController.addProduct as any,
); // Добавить товар
router.delete("/items/:productId", wishlistController.removeProduct as any); // Удалить товар
router.post(
  "/toggle",
  wishlistValidators.addOrRemoveProduct,
  wishlistController.toggleProduct as any,
); // Переключить товар
router.delete("/", wishlistController.clearWishlist as any); // Очистить избранное

export default router;
