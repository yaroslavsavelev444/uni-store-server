const logger = require('../logger/logger');
const paymentService = require('../services/paymentService');

class PaymentController {
  async initPayment(req, res, next) {
    try {
      const { orderId, returnUrl, amount, currency, description } = req.body;
      const userId = req.user.id;

      // Все проверки и логика — в сервисе
      const result = await paymentService.initPayment({
        orderId,
        returnUrl,
        amount,
        currency,
        description,
        userId,
      });

      logger.info('initPayment', result)

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getPaymentStatus(req, res, next) {
    try {
      const { paymentId } = req.params;
      const result = await paymentService.getPaymentStatus(paymentId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PaymentController();