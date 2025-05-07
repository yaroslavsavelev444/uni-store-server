const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');

router.get('/getOrders', ordersController.getOrders);
router.post('/cancelOrder', ordersController.cancelOrder);
router.post('/createOrder', ordersController.createOrder);

router.get('/getCompanies', ordersController.getCompanies);
router.post('/deleteCompany', ordersController.deleteCompany);

module.exports = router;