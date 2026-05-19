import { Router } from "express";

const router = Router();

import cartController from "../controllers/cartController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validateCartItem } from "../validators/cart.validator.js";

router.use(authMiddleware.requireAuth);

router.get("/", cartController.getCart);
router.put("/items", validateCartItem, cartController.addOrUpdateItem);
router.delete("/items/:productId", cartController.removeItem);
router.delete("/", cartController.clearCart);
router.patch("/items/:productId/decrease", cartController.decreaseQuantity);

export default router;
