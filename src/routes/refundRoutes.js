const express = require('express');
const router = express.Router();
const refundController = require('../controllers/refundController');
const validationMiddleware = require('../middlewares/validation-middleware');
const authMiddleware = require('../middlewares/auth-middleware');

// Валидационные схемы
const refundSchemas = {
  createRefund: {
    body: {
      type: 'object',
      required: ['orderId', 'orderNumber', 'userEmail', 'items', 'reason', 'description'],
      properties: {
        orderId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
        orderNumber: { type: 'string', minLength: 3, maxLength: 50 },
        userEmail: { type: 'string', format: 'email' },
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['productId', 'sku', 'productName', 'quantity', 'pricePerUnit', 'reason'],
            properties: {
              productId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              sku: { type: 'string', minLength: 1, maxLength: 100 },
              productName: { type: 'string', minLength: 1, maxLength: 200 },
              quantity: { type: 'integer', minimum: 1, maximum: 1000 },
              pricePerUnit: { type: 'number', minimum: 0 },
              reason: { type: 'string' },
              reasonDetails: { type: 'string', maxLength: 500 },
              isDefective: { type: 'boolean' },
              defectDescription: { type: 'string', maxLength: 500 }
            }
          }
        },
        reason: { type: 'string' },
        description: { type: 'string', minLength: 10, maxLength: 2000 },
        media: {
          type: 'array',
          items: {
            type: 'object',
            required: ['url'],
            properties: {
              url: { type: 'string' },
              type: { type: 'string', enum: ['image', 'video', 'document'] },
              originalName: { type: 'string', maxLength: 255 },
              size: { type: 'integer', minimum: 0 }
            }
          }
        },
        shippingMethod: { type: 'string' },
        trackingNumber: { type: 'string' }
      }
    }
  },
  
  updateStatus: {
    body: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string' },
        reason: { type: 'string', maxLength: 500 },
        refundAmount: { type: 'number', minimum: 0 },
        refundMethod: { type: 'string', enum: ['original_payment', 'bank_transfer', 'credit', 'other'] },
        resolutionNotes: { type: 'string', maxLength: 1000 },
        notes: { type: 'string', maxLength: 1000 }
      }
    }
  },
  
  assignToAdmin: {
    body: {
      type: 'object',
      required: ['adminId', 'adminName'],
      properties: {
        adminId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
        adminName: { type: 'string', minLength: 1, maxLength: 100 }
      }
    }
  },
  
  addAdminNote: {
    body: {
      type: 'object',
      required: ['note'],
      properties: {
        note: { type: 'string', minLength: 1, maxLength: 1000 }
      }
    }
  }
};

// Публичные роуты
router.get('/reasons', refundController.getRefundReasons);
router.get('/statuses', refundController.getRefundStatuses);

// Защищенные роуты (требуют аутентификации)
router.use(authMiddleware(['all']));

// Пользовательские роуты
router.post(
  '/',
  validationMiddleware(refundSchemas.createRefund),
  refundController.createRefund
);

router.get(
  '/my',
  refundController.getUserRefunds
);

router.get(
  '/my/:id',
  refundController.getRefundById
);

// Админские роуты (требуют роли admin)
router.use(authMiddleware(['all']));

router.get(
  '/',
  refundController.getAllRefunds
);

router.get(
  '/stats',
  refundController.getRefundStats
);

router.put(
  '/:id/status',
  validationMiddleware(refundSchemas.updateStatus),
  refundController.updateRefundStatus
);

router.put(
  '/:id/assign',
  validationMiddleware(refundSchemas.assignToAdmin),
  refundController.assignRefundToAdmin
);

router.post(
  '/:id/notes',
  validationMiddleware(refundSchemas.addAdminNote),
  refundController.addAdminNote
);

router.get(
  '/:id',
  refundController.getRefundById
);

module.exports = router;