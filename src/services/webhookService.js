const paymentService = require('./paymentService');

class WebhookService {
  async handlePaymentSucceeded(data) {
    await paymentService.handleRobokassaPaymentSuccess(data.invId, data.outSum);
  }
}

module.exports = new WebhookService();