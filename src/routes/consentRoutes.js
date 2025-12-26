// routes/consent.routes.js
const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');
const authMiddleware = require('../middlewares/auth-middleware');

// Публичные роуты (доступны всем)
router.get('/', consentController.list);
router.get('/:slug', consentController.getBySlug);
router.get('/:slug/active', consentController.getActive);

// Защищенные роуты (требуют аутентификации)

router.use(authMiddleware(['admin']));
// Админские роуты (требуют прав администратора)
router.post('/', consentController.create);

// Роуты управления версиями
router.post('/:slug/versions', consentController.addVersion);
router.put('/:slug/versions/:versionId', consentController.updateVersion);
router.patch('/:slug/versions/:versionId/publish', consentController.publishVersion);
router.delete('/:slug/versions/:versionId', consentController.deleteVersion);

module.exports = router;