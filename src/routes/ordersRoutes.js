const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');

router.get('/getOrders', ordersController.getOrders);

module.exports = router;