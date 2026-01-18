const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');
const authMiddleware = require('../middlewares/auth-middleware');

// Публичные роуты (доступны всем)
router.get('/', consentController.list);
router.get('/registration', consentController.getForRegistration); 
router.get('/required', consentController.getRequiredForAcceptance); 
router.get('/:slug', consentController.getBySlug);

// Защищенные роуты (требуют аутентификации)
router.use(authMiddleware(['admin']));

// Админские роуты
router.post('/', consentController.create);
router.put('/:slug', consentController.update);
router.patch('/:slug/activate', consentController.activate);
router.patch('/:slug/deactivate', consentController.deactivate);
router.delete('/:slug', consentController.delete);

module.exports = router;