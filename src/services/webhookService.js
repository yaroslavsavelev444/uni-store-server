const paymentService = require('./paymentService');

class WebhookService {
  async handlePaymentSucceeded(yooPayment) {
    await paymentService.handlePaymentSucceeded(yooPayment);
  }

  async handlePaymentCanceled(yooPayment) {
    await paymentService.handlePaymentCanceled(yooPayment);
  }

  async handlePaymentWaitingForCapture(yooPayment) {
    await paymentService.handlePaymentWaitingForCapture(yooPayment);
  }

  async handleRefundSucceeded(refund) {
    await paymentService.handleRefundSucceeded(refund);
  }
}

module.exports = new WebhookService();