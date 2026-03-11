import { Router } from "express";

const router = Router();

import cartController from "../controllers/cartController";
import authMiddleware from "../middlewares/auth-middleware";
import { validateCartItem } from "../validators/cart.validator";

router.use(authMiddleware(["all"]));

router.get("/", cartController.getCart); // Получить корзину
router.put("/items", validateCartItem, cartController.addOrUpdateItem); // Добавить/обновить товар
router.delete("/items/:productId", cartController.removeItem); // Удалить товар
router.delete("/", cartController.clearCart); // Очистить корзину
router.patch("/items/:productId/decrease", cartController.decreaseQuantity); // Уменьшить количество

export default router;
