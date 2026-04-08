const logger = require('../logger/logger');
const paymentService = require('../services/paymentService');

class PaymentController {
  async initPayment(req, res, next) {
    try {
      const { orderId, amount, currency, description, isTest = true } = req.body;
      const userId = req.user.id;

      const result = await paymentService.initPayment({
        orderId,
        amount,
        currency,
        description,
        userId,
        isTest,    
      });

      console.log('initPayment Robokassa', result);
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