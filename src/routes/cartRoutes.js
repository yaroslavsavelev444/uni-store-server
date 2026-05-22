const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { validateCartItem } = require("../validators/cart.validator");
const authMiddleware = require("../middlewares/auth-middleware");

router.use(authMiddleware(["all"]));

router.get("/", cartController.getCart);                    
router.put("/items", validateCartItem, cartController.addOrUpdateItem); 
router.delete("/items/:productId", cartController.removeItem); 
router.delete("/", cartController.clearCart);              
router.patch("/items/:productId/decrease", cartController.decreaseQuantity);

module.exports = router;