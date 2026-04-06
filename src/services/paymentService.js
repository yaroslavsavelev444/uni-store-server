const mongoose = require('mongoose'); // добавлено для транзакций
const yooCheckout = require('../config/yookassa');
const ApiError = require('../exceptions/api-error');
const { v4: uuid } = require('uuid');
const { OrderModel, PaymentModel, OrderStatus, UserModel } = require('../models/index.models');
const logger = require('../logger/logger');
const OrderCacheService = require('./OrderCacheService');
const { sendEmailNotification, sendPushNotification } = require('../queues/taskQueues');

class PaymentService {
  async initPayment({ orderId, returnUrl, amount: clientAmount, currency: clientCurrency, description, userId }) {
    // Все проверки и логика из контроллера перенесены сюда
    if (!orderId || !returnUrl) {
      throw ApiError.BadRequest('Отсутствуют orderId или returnUrl');
    }

    const order = await OrderModel.findById(orderId);
    if (!order) throw ApiError.BadRequest('Заказ не найден');
    if (order.user.toString() !== userId) throw ApiError.ForbiddenError('Это не ваш заказ');
    if (order.payment.transactionId) {
    const existingYooPayment = await yooCheckout.getPayment(order.payment.transactionId);
    logger.info(`[PaymentService] Проверяем существующий платёж ${existingYooPayment.id}`);
    switch (existingYooPayment.status) {
      case 'succeeded':
        throw ApiError.BadRequest('Заказ уже оплачен. Повторная оплата невозможна.');

      case 'pending':
      case 'waiting_for_capture':
        // Возвращаем существующий платёж — пользователь просто переходит по старой ссылке
        logger.info(`[PaymentService] Возвращаем существующий pending-платёж ${existingYooPayment.id}`);
        return {
          success: true,
          paymentId: existingYooPayment.id,
          confirmationUrl: existingYooPayment.confirmation.confirmation_url,
          status: existingYooPayment.status,
          message: 'Платёж уже создан. Перейдите по ссылке для оплаты.'
        };

      case 'canceled':
        // Старый платеж отменён — очищаем и создаём новый
        logger.info(`[PaymentService] Старый платёж отменён, создаём новый для заказа ${orderId}`);
        order.payment.transactionId = null;
        order.payment.status = 'pending';
        await order.save();
        break; // продолжаем создание нового платежа ниже

      default:
        throw ApiError.BadRequest('Неизвестный статус существующего платежа');
    }
  }
    if (order.payment.status !== 'pending') {
      throw ApiError.BadRequest('Платёж уже инициирован или обработан');
    }

    // Жёсткая проверка суммы (защита от подмены)
    const expectedAmount = order.pricing.total;
    const expectedCurrency = order.pricing.currency || 'RUB';
    if (parseFloat(clientAmount) !== expectedAmount || clientCurrency !== expectedCurrency) {
      throw ApiError.BadRequest('Сумма или валюта не совпадает с заказом');
    }

    const payload = {
      amount: {
        value: expectedAmount.toFixed(2), // строго строка!
        currency: expectedCurrency,
      },
      description: description || `Оплата заказа #${order.orderNumber}`,
      confirmation: {
        type: 'redirect',
        return_url: returnUrl,
      },
      capture: true,
      metadata: {
        orderId: order._id.toString(),
        userId: userId,
        orderNumber: order.orderNumber,
      },
    };

    const idempotenceKey = uuid();

    const yooPayment = await yooCheckout.createPayment(payload, idempotenceKey);

    // Сохраняем полный платёж
    const paymentDoc = new PaymentModel({
      yooPaymentId: yooPayment.id,
      order: order._id,
      user: userId,
      amount: {
        value: parseFloat(yooPayment.amount.value),
        currency: yooPayment.amount.currency,
      },
      status: yooPayment.status,
      metadata: yooPayment.metadata,
    });
    await paymentDoc.save();

    // Обновляем заказ
    order.payment.transactionId = yooPayment.id;
    order.payment.status = 'pending';
    await order.save();

    return {
      success: true,
      paymentId: yooPayment.id,
      confirmationUrl: yooPayment.confirmation.confirmation_url,
      status: yooPayment.status,
    };
  }

  async getPaymentStatus(paymentId) {
    const payment = await yooCheckout.getPayment(paymentId);
    return { success: true, payment };
  }

  // ==================== НОВЫЙ ГЛАВНЫЙ МЕТОД ДЛЯ ВЕБХУКА ====================
  /**
   * Выполняет ВСЕ действия от вебхука ЮKassa (успех, отмена, возврат и т.д.)
   */
  async processYooKassaWebhook(notification) {
    if (notification.type !== 'notification') return;

    const eventType = notification.event;
    const yooObject = notification.object;

    logger.info(`[PaymentService] Webhook: ${eventType} | yooId: ${yooObject.id}`);

    switch (eventType) {
      case 'payment.succeeded':
        await this.handlePaymentSucceeded(yooObject);
        break;
      case 'payment.canceled':
        await this.handlePaymentCanceled(yooObject);
        break;
      case 'payment.waiting_for_capture':
        await this.handlePaymentWaitingForCapture(yooObject);
        break;
      case 'refund.succeeded':
        await this.handleRefundSucceeded(yooObject);
        break;
      default:
        logger.warn(`[PaymentService] Неизвестный event: ${eventType}`);
    }
  }

  // ==================== ДЕКОМПОЗИРОВАННЫЕ МЕТОДЫ (с побочными действиями) ====================

  async handlePaymentSucceeded(yooPayment) {
    const yooId = yooPayment.id;
    const orderId = yooPayment.metadata?.orderId;
    if (!orderId) return;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await OrderModel.findById(orderId).session(session);
      if (!order || order.payment.status === 'paid') {
        await session.abortTransaction();
        return;
      }

      await PaymentModel.updateOne(
        { yooPaymentId: yooId },
        {
          status: 'succeeded',
          paidAt: yooPayment.paid_at ? new Date(yooPayment.paid_at) : new Date(),
        }
      ).session(session);

      order.payment.status = 'paid';
      order.payment.paidAt = new Date();
      order.status = OrderStatus.PAID;
      order.statusHistory.push({
        status: OrderStatus.PAID,
        changedAt: new Date(),
        changedBy: order.user,
        comment: 'Оплата успешно подтверждена через ЮKassa',
        metadata: { yooPaymentId: yooId },
      });
      await order.save({ session });

      await session.commitTransaction();

      // Побочные действия после успешного коммита
      await OrderCacheService.invalidateOrderCache(orderId);
      await OrderCacheService.invalidateUserCache(order.user.toString());
      await this._sendPaymentSuccessNotifications(order);

      logger.info(`[PaymentService] Заказ ${order.orderNumber} успешно оплачен (yooId: ${yooId})`);
    } catch (err) {
      await session.abortTransaction();
      logger.error(`[PaymentService] Error in handlePaymentSucceeded for yooId ${yooId}:`, err);
      throw err;
    } finally {
      session.endSession();
    }
  }

  async handlePaymentCanceled(yooPayment) {
    const yooId = yooPayment.id;
    const orderId = yooPayment.metadata?.orderId;
    if (!orderId) return;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await OrderModel.findById(orderId).session(session);
      if (!order) {
        await session.abortTransaction();
        return;
      }

      await PaymentModel.updateOne(
        { yooPaymentId: yooId },
        { status: 'canceled' }
      ).session(session);

      order.payment.status = 'canceled';
      order.statusHistory.push({
        status: OrderStatus.CANCELLED,
        changedAt: new Date(),
        changedBy: order.user,
        comment: 'Платёж отменён ЮKassa',
        metadata: { yooPaymentId: yooId },
      });
      await order.save({ session });

      await session.commitTransaction();

      await OrderCacheService.invalidateOrderCache(orderId);
      await OrderCacheService.invalidateUserCache(order.user.toString());
      await this._sendPaymentCanceledNotifications(order);

      logger.info(`[PaymentService] Платёж отменён для заказа ${order.orderNumber}`);
    } catch (err) {
      await session.abortTransaction();
      logger.error(`[PaymentService] Error in handlePaymentCanceled for yooId ${yooId}:`, err);
      throw err;
    } finally {
      session.endSession();
    }
  }

  async handlePaymentWaitingForCapture(yooPayment) {
    const yooId = yooPayment.id;
    await PaymentModel.updateOne({ yooPaymentId: yooId }, { status: 'waiting_for_capture' });
    logger.info(`[PaymentService] Платёж в ожидании захвата: ${yooId}`);
  }

  async handleRefundSucceeded(refund) {
    const yooPaymentId = refund.payment_id;
    // Предварительная проверка наличия заказа (без транзакции)
    const order = await OrderModel.findOne({ 'payment.transactionId': yooPaymentId });
    if (!order) return;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Перезагружаем заказ внутри транзакции для согласованности
      const orderInSession = await OrderModel.findById(order._id).session(session);
      if (!orderInSession) {
        await session.abortTransaction();
        return;
      }

      await PaymentModel.updateOne(
        { yooPaymentId },
        { status: 'refunded' }
      ).session(session);

      orderInSession.payment.status = 'refunded';
      orderInSession.status = OrderStatus.REFUNDED;
      orderInSession.statusHistory.push({
        status: OrderStatus.REFUNDED,
        changedAt: new Date(),
        changedBy: orderInSession.user,
        comment: `Возврат выполнен ЮKassa (refundId: ${refund.id})`,
        metadata: { refundId: refund.id },
      });
      await orderInSession.save({ session });

      await session.commitTransaction();

      await OrderCacheService.invalidateOrderCache(orderInSession._id);
      await OrderCacheService.invalidateUserCache(orderInSession.user.toString());
      await this._sendRefundNotifications(orderInSession, refund);

      logger.info(`[PaymentService] Возврат выполнен для заказа ${orderInSession.orderNumber}`);
    } catch (err) {
      await session.abortTransaction();
      logger.error(`[PaymentService] Error in handleRefundSucceeded for payment ${yooPaymentId}:`, err);
      throw err;
    } finally {
      session.endSession();
    }
  }

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