const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { validateCartItem } = require("../validators/cart.validator");
const authMiddleware = require("../middlewares/auth-middleware");

router.use(authMiddleware(["all"]));

router.get("/", cartController.getCart);                    // Получить корзину
router.put("/items", validateCartItem, cartController.addOrUpdateItem); // Добавить/обновить товар
router.delete("/items/:productId", cartController.removeItem); // Удалить товар
router.delete("/", cartController.clearCart);              // Очистить корзину
router.patch("/items/:productId/decrease", cartController.decreaseQuantity); // Уменьшить количество

module.exports = router;