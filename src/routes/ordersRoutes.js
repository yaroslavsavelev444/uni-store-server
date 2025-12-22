const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');
const authMiddleware = require('../middlewares/auth-middleware');

router.get('/', ordersController.getOrders);
router.get('/all',authMiddleware('admin'),  ordersController.getOrders);
router.get('/all',authMiddleware('admin'),  ordersController.getOrders);
router.post('/create', authMiddleware('user'), ordersController.createOrder);
router.post("/:id/files", ordersController.uploadOrderFile);
router.delete("/:id/files/:fileId", ordersController.deleteOrderFile);

module.exports = router;