// routes/orders.routes.js
const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/ordersController');
const authMiddleware = require('../middlewares/auth-middleware');
// const upload = require('../middlewares/upload-middleware');

// ========== USER ROUTES ==========
router.get(
  '/',
  authMiddleware('user'),
  ordersController.getOrders
);

router.get(
  '/:id',
  authMiddleware('user'),
  ordersController.getOrder
);

router.post(
  '/',
  authMiddleware('user'),
  ordersController.createOrder
);

router.post(
  '/:id/cancel',
  authMiddleware('user'),
  ordersController.cancelOrder
);

// ========== ADMIN ROUTES ==========
router.get(
  '/admin/orders',
  authMiddleware('admin'),
  ordersController.getAdminOrders
);

router.get(
  '/admin/orders/:id',
  authMiddleware('admin'),
  ordersController.getAdminOrder
);

router.patch(
  '/admin/orders/:id/status',
  authMiddleware('admin'),
  ordersController.updateOrderStatus
);

router.post(
  '/admin/orders/:id/cancel',
  authMiddleware('admin'),
  ordersController.cancelOrderAdmin
);

router.post(
  '/admin/orders/:id/attachments',
  authMiddleware('admin'),
//   upload.single('file'),
  ordersController.uploadAttachment
);

router.delete(
  '/admin/orders/:id/attachments/:fileId',
  authMiddleware('admin'),
  ordersController.deleteAttachment
);

module.exports = router;