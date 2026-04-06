const Router = require('express').Router;
const webhookController = require('../controllers/webhookController');
const webhookMiddleware = require('../middlewares/webhookMiddleware');

const router = new Router();

// ЮKassa будет отправлять POST на этот URL
router.post('/yookassa', webhookMiddleware, webhookController.handleYooKassaWebhook);

module.exports = router;