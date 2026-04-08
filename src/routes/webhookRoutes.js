const Router = require('express').Router;
const webhookController = require('../controllers/webhookController');
const webhookMiddleware = require('../middlewares/webhookMiddleware');

const router = new Router();

router.post('/robokassa', webhookMiddleware, webhookController.handleRobokassaWebhook); // ← новый путь

module.exports = router;