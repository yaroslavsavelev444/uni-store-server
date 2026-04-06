const logger = require('../logger/logger');
const webhookService = require('../services/webhookService');

class WebhookController {
  async handleYooKassaWebhook(req, res) {
    try {
      const notification = req.body;

      if (notification.type !== 'notification') {
        return res.sendStatus(200);
      }

      const eventType = notification.event;
      const yooObject = notification.object;

      logger.info(`YooKassa webhook: ${eventType}`);

      switch (eventType) {
        case 'payment.succeeded':
          await webhookService.handlePaymentSucceeded(yooObject);
          break;
        case 'payment.canceled':
          await webhookService.handlePaymentCanceled(yooObject);
          break;
        case 'payment.waiting_for_capture':
          await webhookService.handlePaymentWaitingForCapture(yooObject);
          break;
        case 'refund.succeeded':
          await webhookService.handleRefundSucceeded(yooObject);
          break;
        default:
          console.log('Unhandled event:', eventType);
      }

      res.sendStatus(200); // ОБЯЗАТЕЛЬНО 200
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.sendStatus(200); // даже при ошибке — не даём YooKassa повторять вечно
    }
  }
}

module.exports = new WebhookController();