import { Router } from "express";

const router = Router();

import cartController from "../controllers/cartController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validateCartItem } from "../validators/cart.validator.js";

router.use(authMiddleware.requireAuth());

router.get("/", cartController.getCart as any);
router.put("/items", validateCartItem, cartController.addOrUpdateItem as any);
router.delete("/items/:productId", cartController.removeItem as any);
router.delete("/", cartController.clearCart as any);
router.patch(
  "/items/:productId/decrease",
  cartController.decreaseQuantity as any,
);

export default router;
