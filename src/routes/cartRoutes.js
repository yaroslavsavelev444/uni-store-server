import { Router } from "express";

const router = Router();

import {
	addOrUpdateItem,
	clearCart,
	decreaseQuantity,
	getCart,
	removeItem,
} from "../controllers/cartController";
import authMiddleware from "../middlewares/auth-middleware";
import { validateCartItem } from "../validators/cart.validator";

router.use(authMiddleware(["all"]));

router.get("/", getCart);
router.put("/items", validateCartItem, addOrUpdateItem);
router.delete("/items/:productId", removeItem);
router.delete("/", clearCart);
router.patch("/items/:productId/decrease", decreaseQuantity);

export default router;
