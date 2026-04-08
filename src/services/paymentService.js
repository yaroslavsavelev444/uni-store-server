const mongoose = require('mongoose');
const ApiError = require('../exceptions/api-error');
const { OrderModel, PaymentModel, OrderStatus, UserModel } = require('../models/index.models');
const logger = require('../logger/logger');
const OrderCacheService = require('./OrderCacheService');
const { sendEmailNotification, sendPushNotification } = require('../queues/taskQueues');
const robokassa = require('../services/robokassaService');

class PaymentService {
  async initPayment({ orderId, amount: clientAmount, currency: clientCurrency, description, userId, isTest = false }) {
    if (!orderId) throw ApiError.BadRequest('Отсутствует orderId');

    const order = await OrderModel.findById(orderId);
    if (!order) throw ApiError.BadRequest('Заказ не найден');
    if (order.user.toString() !== userId) throw ApiError.ForbiddenError('Это не ваш заказ');

    if (order.payment.status === 'paid') {
      throw ApiError.BadRequest('Заказ уже оплачен. Повторная оплата невозможна.');
    }

    // Жёсткая проверка суммы
    const expectedAmount = order.pricing.total;
    const expectedCurrency = order.pricing.currency || 'RUB';
    if (parseFloat(clientAmount) !== expectedAmount || clientCurrency !== expectedCurrency) {
      throw ApiError.BadRequest('Сумма или валюта не совпадает с заказом');
    }

    const invId = parseInt(order.orderNumber.replace(/\D/g, ''));
    if (isNaN(invId)) throw ApiError.BadRequest('Не удалось сгенерировать InvId');

    // Если уже есть transactionId (предыдущая попытка) — просто возвращаем новую ссылку (InvId уникален)
    const paymentUrl = robokassa.buildPaymentUrl({
      invId,
      outSum: expectedAmount,
      description: description || `Оплата заказа #${order.orderNumber}`,
      email: order.recipient.email,
      isTest,
    });

    // Создаём запись Payment (один раз)
    if (!order.payment.transactionId) {
      const paymentDoc = new PaymentModel({
        robokassaInvId: invId.toString(),
        order: order._id,
        user: userId,
        amount: { value: expectedAmount, currency: expectedCurrency },
        status: 'pending',
      });
      await paymentDoc.save();

      order.payment.transactionId = invId.toString();
      order.payment.status = 'pending';
      await order.save();
    }

    return {
      success: true,
      paymentId: invId.toString(),
      confirmationUrl: paymentUrl,
      status: 'pending',
      message: isTest ? 'Тестовый платёж создан' : 'Платёж создан. Перейдите по ссылке для оплаты.',
    };
  }

  async getPaymentStatus(paymentId) {
    const payment = await PaymentModel.findOne({ robokassaInvId: paymentId });
    if (!payment) return { success: false, message: 'Платёж не найден' };
    return { success: true, payment };
  }

  // ==================== НОВЫЙ ГЛАВНЫЙ МЕТОД ДЛЯ ВЕБХУКА ====================
  /**
   * Выполняет ВСЕ действия от вебхука ЮKassa (успех, отмена, возврат и т.д.)
   */
  // async processYooKassaWebhook(notification) {
  //   if (notification.type !== 'notification') return;

  //   const eventType = notification.event;
  //   const yooObject = notification.object;

  //   logger.info(`[PaymentService] Webhook: ${eventType} | yooId: ${yooObject.id}`);

  //   switch (eventType) {
  //     case 'payment.succeeded':
  //       await this.handlePaymentSucceeded(yooObject);
  //       break;
  //     case 'payment.canceled':
  //       await this.handlePaymentCanceled(yooObject);
  //       break;
  //     case 'payment.waiting_for_capture':
  //       await this.handlePaymentWaitingForCapture(yooObject);
  //       break;
  //     case 'refund.succeeded':
  //       await this.handleRefundSucceeded(yooObject);
  //       break;
  //     default:
  //       logger.warn(`[PaymentService] Неизвестный event: ${eventType}`);
  //   }
  // }

  // ==================== ДЕКОМПОЗИРОВАННЫЕ МЕТОДЫ (с побочными действиями) ====================

 async handleRobokassaPaymentSuccess(invIdStr, receivedOutSum) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await OrderModel.findOne({ 'payment.transactionId': invIdStr }).session(session);
      if (!order || order.payment.status === 'paid') {
        await session.abortTransaction();
        return;
      }

      // Опциональная проверка суммы
      if (parseFloat(receivedOutSum) !== order.pricing.total) {
        logger.warn(`[PaymentService] Сумма в вебхуке не совпадает с заказом ${order.orderNumber}`);
      }

      await PaymentModel.updateOne(
        { robokassaInvId: invIdStr },
        { status: 'succeeded', paidAt: new Date() }
      ).session(session);

      order.payment.status = 'paid';
      order.payment.paidAt = new Date();
      order.status = OrderStatus.PAID;
      order.statusHistory.push({
        status: OrderStatus.PAID,
        changedAt: new Date(),
        changedBy: order.user,
        comment: 'Оплата успешно подтверждена через Robokassa',
        metadata: { robokassaInvId: invIdStr },
      });

      await order.save({ session });
      await session.commitTransaction();

      await OrderCacheService.invalidateOrderCache(order._id);
      await OrderCacheService.invalidateUserCache(order.user.toString());
      await this._sendPaymentSuccessNotifications(order);

      logger.info(`[PaymentService] Заказ ${order.orderNumber} успешно оплачен (InvId: ${invIdStr})`);
    } catch (err) {
      await session.abortTransaction();
      logger.error(`[PaymentService] Error in handleRobokassaPaymentSuccess for InvId ${invIdStr}:`, err);
      throw err;
    } finally {
      session.endSession();
    }
  }
  // async handlePaymentCanceled(yooPayment) {
  //   const yooId = yooPayment.id;
  //   const orderId = yooPayment.metadata?.orderId;
  //   if (!orderId) return;

  //   const session = await mongoose.startSession();
  //   session.startTransaction();
  //   try {
  //     const order = await OrderModel.findById(orderId).session(session);
  //     if (!order) {
  //       await session.abortTransaction();
  //       return;
  //     }

  //     await PaymentModel.updateOne(
  //       { yooPaymentId: yooId },
  //       { status: 'canceled' }
  //     ).session(session);

  //     order.payment.status = 'canceled';
  //     order.statusHistory.push({
  //       status: OrderStatus.CANCELLED,
  //       changedAt: new Date(),
  //       changedBy: order.user,
  //       comment: 'Платёж отменён ЮKassa',
  //       metadata: { yooPaymentId: yooId },
  //     });
  //     await order.save({ session });

  //     await session.commitTransaction();

  //     await OrderCacheService.invalidateOrderCache(orderId);
  //     await OrderCacheService.invalidateUserCache(order.user.toString());
  //     await this._sendPaymentCanceledNotifications(order);

  //     logger.info(`[PaymentService] Платёж отменён для заказа ${order.orderNumber}`);
  //   } catch (err) {
  //     await session.abortTransaction();
  //     logger.error(`[PaymentService] Error in handlePaymentCanceled for yooId ${yooId}:`, err);
  //     throw err;
  //   } finally {
  //     session.endSession();
  //   }
  // }

  // async handlePaymentWaitingForCapture(yooPayment) {
  //   const yooId = yooPayment.id;
  //   await PaymentModel.updateOne({ yooPaymentId: yooId }, { status: 'waiting_for_capture' });
  //   logger.info(`[PaymentService] Платёж в ожидании захвата: ${yooId}`);
  // }

  // async handleRefundSucceeded(refund) {
  //   const yooPaymentId = refund.payment_id;
  //   // Предварительная проверка наличия заказа (без транзакции)
  //   const order = await OrderModel.findOne({ 'payment.transactionId': yooPaymentId });
  //   if (!order) return;

  //   const session = await mongoose.startSession();
  //   session.startTransaction();
  //   try {
  //     // Перезагружаем заказ внутри транзакции для согласованности
  //     const orderInSession = await OrderModel.findById(order._id).session(session);
  //     if (!orderInSession) {
  //       await session.abortTransaction();
  //       return;
  //     }

  //     await PaymentModel.updateOne(
  //       { yooPaymentId },
  //       { status: 'refunded' }
  //     ).session(session);

  //     orderInSession.payment.status = 'refunded';
  //     orderInSession.status = OrderStatus.REFUNDED;
  //     orderInSession.statusHistory.push({
  //       status: OrderStatus.REFUNDED,
  //       changedAt: new Date(),
  //       changedBy: orderInSession.user,
  //       comment: `Возврат выполнен ЮKassa (refundId: ${refund.id})`,
  //       metadata: { refundId: refund.id },
  //     });
  //     await orderInSession.save({ session });

  //     await session.commitTransaction();

  //     await OrderCacheService.invalidateOrderCache(orderInSession._id);
  //     await OrderCacheService.invalidateUserCache(orderInSession.user.toString());
  //     await this._sendRefundNotifications(orderInSession, refund);

  //     logger.info(`[PaymentService] Возврат выполнен для заказа ${orderInSession.orderNumber}`);
  //   } catch (err) {
  //     await session.abortTransaction();
  //     logger.error(`[PaymentService] Error in handleRefundSucceeded for payment ${yooPaymentId}:`, err);
  //     throw err;
  //   } finally {
  //     session.endSession();
  //   }
  // }

  // ==================== ВНУТРЕННИЕ УВЕДОМЛЕНИЯ ====================
  async _sendPaymentSuccessNotifications(order) {
    try {
      // Пользователю
      await sendEmailNotification(order.recipient.email, 'paymentSucceeded', {
        orderNumber: order.orderNumber,
        orderData: order.toObject(),
      });
      await sendPushNotification({
        userId: order.user,
        title: 'Оплата прошла успешно',
        body: `Заказ №${order.orderNumber} оплачен`,
      });

      // Админам
      const admins = await UserModel.find({ role: 'admin' });
      for (const admin of admins) {
        await sendEmailNotification(admin.email, 'paymentReceivedAdmin', {
          orderNumber: order.orderNumber,
          orderData: order.toObject(),
        });
      }
    } catch (err) {
      logger.error('[PaymentService] Ошибка уведомлений об успехе оплаты:', err);
    }
  }

  async _sendPaymentCanceledNotifications(order) {
    try {
      await sendEmailNotification(order.recipient.email, 'paymentCanceled', {
        orderNumber: order.orderNumber,
        orderData: order.toObject(),
      });
      await sendPushNotification({
        userId: order.user,
        title: 'Оплата отменена',
        body: `Платёж по заказу №${order.orderNumber} отменён`,
      });
    } catch (err) {
      logger.error('[PaymentService] Ошибка уведомлений об отмене:', err);
    }
  }

  async _sendRefundNotifications(order, refund) {
    try {
      await sendEmailNotification(order.recipient.email, 'refundSucceeded', {
        orderNumber: order.orderNumber,
        refundAmount: refund.amount?.value,
        orderData: order.toObject(),
      });
    } catch (err) {
      logger.error('[PaymentService] Ошибка уведомлений о возврате:', err);
    }
  }
}

module.exports = new PaymentService();