const express = require('express');
const router = express.Router();
const organizationContactController = require('../controllers/contactsController');
const validator = require('../validators/contacts.validator');
const authMiddleware = require('../middlewares/auth-middleware');

// Публичные роуты
router.get('/', organizationContactController.getContacts);
router.get('/export/vcard', organizationContactController.exportVCard);
router.get('/health', organizationContactController.healthCheck);

// Админские роуты
router.get('/admin', authMiddleware(["admin"]), organizationContactController.getAdminContacts);
router.put('/admin', authMiddleware(["admin"]), validator.validateCreateUpdate, organizationContactController.updateContacts);
router.patch('/admin/toggle-active', authMiddleware(["admin"]), organizationContactController.toggleActive);
router.get('/admin/history', authMiddleware(["admin"]), organizationContactController.getChangeHistory);

module.exports = router;