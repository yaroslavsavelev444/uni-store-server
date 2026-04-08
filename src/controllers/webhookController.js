const logger = require('../logger/logger');
const webhookService = require('../services/webhookService');
const robokassa = require('../services/robokassaService');

class WebhookController {
  async handleRobokassaWebhook(req, res) {
    try {
      const params = req.body;
      logger.info(`Robokassa webhook InvId=${params.InvId}`);

      if (!robokassa.verifySignature(params)) {
        logger.warn('Неверная подпись Robokassa');
        return res.sendStatus(200);
      }

      const invId = params.InvId;
      const outSum = params.OutSum;

      await webhookService.handlePaymentSucceeded({ invId: invId.toString(), outSum });
      res.send(`OK${invId}`); // ← обязательно по документации
    } catch (error) {
      logger.error('Webhook Robokassa error:', error);
      res.sendStatus(200);
    }
  }
}

module.exports = new WebhookController();