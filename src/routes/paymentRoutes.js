const Router = require('express').Router;
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middlewares/auth-middleware');

const router = new Router();

router.post('/init', authMiddleware(['all']), paymentController.initPayment);
router.get('/:paymentId', authMiddleware(['all']), paymentController.getPaymentStatus);

module.exports = router;