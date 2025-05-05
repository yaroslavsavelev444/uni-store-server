const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

router.get('/getCart', cartController.getCart);
router.post('/setCartItem', cartController.setCartItem);
router.post('/createOrder', cartController.createOrder);
router.post('/removeFromCart', cartController.removeFromCartProduct);
router.post('/clearCart', cartController.clearCart);

module.exports = router;