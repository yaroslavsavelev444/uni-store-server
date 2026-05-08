import { Router } from "express";

const router = Router();

import cartController from "../controllers/cartController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validateCartItem } from "../validators/cart.validator.js";

router.use(authMiddleware(["all"]));

router.get("/", cartController.getCart);
router.put("/items", validateCartItem, cartController.addOrUpdateItem);
router.delete("/items/:productId", cartController.removeItem);
router.delete("/", clearCart);
router.patch("/items/:productId/decrease", cartController.decreaseQuantity);

module.exports = router;
