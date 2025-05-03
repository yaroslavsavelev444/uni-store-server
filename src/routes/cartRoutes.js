const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

router.get('/get', cartController.getCart);
router.post('/addToCart', cartController.addToCartProduct);
router.post('/removeFromCart', cartController.removeFromCartProduct);
router.post('/clearCart', cartController.clearCart);

module.exports = router;