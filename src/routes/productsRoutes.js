const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
const authMiddleware = require('../middleware/auth-middleware');
const adminMiddleware = require('../middleware/adminMiddleware');

router.get('/getProducts', productsController.getProducts);
router.get('/getProductDetails', productsController.getProductDetails);
router.post('/getProductsByIds', productsController.getProductsByIds);

module.exports = router;