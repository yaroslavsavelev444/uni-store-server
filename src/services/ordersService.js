// services/orders.service.js
const mongoose = require('mongoose');
const ApiError = require('../exceptions/api-error');
const CartService = require('./cartService');
const ProductService = require('./productService');
const OrderCacheService = require('./OrderCacheService');
const redisClient = require('../redis/redis.client');
const logger = require('../logger/logger');
const { sendEmailNotification } = require('../queues/taskQueues');
const { ProductModel, CompanyModel, OrderModel, OrderStatus } = require('../models/index.models');

class OrderService {
  constructor() {
    this.cartService = CartService;
    this.productService = ProductService;
    this.cache = OrderCacheService;
  }

  // ========== PUBLIC METHODS (для пользователей) ==========

  /**
   * Создание нового заказа
   */
  async createOrder(user, orderData) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      // 1. Получаем корзину пользователя
      const cart = await this.cartService.getCart(user.id);
      
      if (!cart.items || cart.items.length === 0) {
        throw ApiError.BadRequest('Корзина пуста');
      }

      // 2. Проверяем валидность корзины
      if (!cart.validation.isValid) {
        throw ApiError.BadRequest('Корзина содержит ошибки', cart.validation.issues);
      }

      // 3. Проверяем доступность товаров и резервируем
      const productUpdates = [];
      const orderItems = [];
      
      for (const item of cart.items) {
        const product = await ProductModel.findById(item.product._id).session(session);
        
        if (!product) {
          throw ApiError.NotFound(`Товар ${item.product.sku} не найден`);
        }
        
        if (product.status !== 'available' && product.status !== 'preorder') {
          throw ApiError.BadRequest(`Товар ${product.title} недоступен для заказа`);
        }
        
        const availableQuantity = product.stockQuantity - product.reservedQuantity;
        if (availableQuantity < item.quantity) {
          throw ApiError.BadRequest(
            `Недостаточное количество товара ${product.title}. Доступно: ${availableQuantity}`
          );
        }
        
        // Резервируем товар
        product.reservedQuantity = (product.reservedQuantity || 0) + item.quantity;
        productUpdates.push(product.save({ session }));
        
        // Формируем элемент заказа
        const unitPrice = item.product.finalPrice || item.product.price;
        orderItems.push({
          product: product._id,
          sku: product.sku,
          name: product.title,
          quantity: item.quantity,
          unitPrice: unitPrice,
          discount: item.product.discount || 0,
          totalPrice: unitPrice * item.quantity,
          weight: product.weight,
          dimensions: product.dimensions
        });
      }

      // 4. Рассчитываем стоимость
      const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const shippingCost = this.calculateShippingCost(orderData.delivery, orderItems);
      const tax = this.calculateTax(subtotal, orderData);
      const total = subtotal + shippingCost + tax;

      // 5. Создаем компанию если нужно
      let companyInfo = null;
      if (orderData.isCompany && orderData.companyData) {
        let company = await CompanyModel.findOne({ user: user.id }).session(session);
        
        if (!company) {
          company = await CompanyModel.create([{
            ...orderData.companyData,
            user: user.id
          }], { session });
          company = company[0];
        }
        
        companyInfo = {
          companyId: company._id,
          name: company.name,
          address: company.address,
          taxNumber: company.taxNumber
        };
      }

      // 6. Создаем заказ
      const order = new OrderModel({
        user: user.id,
        orderNumber: 'temp', // Будет сгенерировано pre-save hook
        delivery: {
          method: orderData.deliveryMethod,
          address: orderData.deliveryAddress,
          pickupPoint: orderData.pickupPoint,
          notes: orderData.deliveryNotes
        },
        recipient: {
          fullName: orderData.recipientName,
          phone: orderData.recipientPhone,
          email: orderData.recipientEmail || user.email,
          companyName: orderData.companyName
        },
        companyInfo,
        items: orderItems,
        pricing: {
          subtotal,
          discount: cart.summary.totalDiscount || 0,
          shippingCost,
          tax,
          total,
          currency: 'RUB'
        },
        payment: {
          method: orderData.paymentMethod,
          status: 'pending'
        },
        status: OrderStatus.PENDING,
        statusHistory: [{
          status: OrderStatus.PENDING,
          changedAt: new Date(),
          changedBy: user.id,
          comment: 'Заказ создан'
        }],
        notes: orderData.notes,
        ipAddress: orderData.ipAddress,
        userAgent: orderData.userAgent,
        source: orderData.source || 'web'
      });

      // 7. Сохраняем все изменения в транзакции
      await Promise.all(productUpdates);
      await order.save({ session });
      
      // 8. Очищаем корзину
      await this.cartService.clearCart(user.id);
      
      await session.commitTransaction();
      
      // 9. Отправляем уведомления (вне транзакции)
      await this.sendOrderNotifications(order, user);
      
      // 10. Кешируем заказ
      await this.cache.setOrder(order);
      await this.cache.invalidateUserCache(user.id);
      
      logger.info(`[OrderService] Заказ создан: ${order.orderNumber} для пользователя ${user.id}`);
      
      return order;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[OrderService] Ошибка создания заказа:`, error);
      throw error;
      
    } finally {
      session.endSession();
    }
  }

  /**
   * Получение заказов пользователя
   */
  async getUserOrders(userId, filters = {}) {
    try {
      // Пробуем получить из кеша
      const cacheKey = JSON.stringify(filters);
      const cached = await this.cache.getUserOrders(userId, cacheKey);
      
      if (cached) {
        return cached;
      }

      const query = { user: userId };
      
      // Применяем фильтры
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
      }
      
      if (filters.search) {
        query.$or = [
          { orderNumber: { $regex: filters.search, $options: 'i' } },
          { 'recipient.fullName': { $regex: filters.search, $options: 'i' } }
        ];
      }

      const orders = await OrderModel.find(query)
        .populate('items.product', 'title sku mainImage')
        .populate('companyInfo.companyId', 'name')
        .sort({ createdAt: -1 })
        .lean();

      // Сохраняем в кеш
      await this.cache.setUserOrders(userId, orders, cacheKey);
      
      return orders;
      
    } catch (error) {
      logger.error(`[OrderService] Ошибка получения заказов пользователя ${userId}:`, error);
      throw ApiError.DatabaseError('Ошибка при получении заказов');
    }
  }

  /**
   * Получение конкретного заказа пользователя
   */
  async getUserOrder(orderId, userId) {
    try {
      // Пробуем получить из кеша
      const cached = await this.cache.getOrder(orderId);
      if (cached && cached.user.toString() === userId) {
        return cached;
      }

      const order = await OrderModel.findOne({
        _id: orderId,
        user: userId
      })
      .populate('items.product')
      .populate('companyInfo.companyId')
      .populate('statusHistory.changedBy', 'name email')
      .lean();

      if (!order) {
        throw ApiError.NotFound('Заказ не найден');
      }

      // Сохраняем в кеш
      await this.cache.setOrder(order);
      
      return order;
      
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[OrderService] Ошибка получения заказа ${orderId}:`, error);
      throw ApiError.DatabaseError('Ошибка при получении заказа');
    }
  }

  /**
   * Отмена заказа пользователем
   */
  async cancelOrderByUser(orderId, userId, reason) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const order = await OrderModel.findOne({
        _id: orderId,
        user: userId
      }).session(session);
      
      if (!order) {
        throw ApiError.NotFound('Заказ не найден');
      }
      
      // Проверяем возможность отмены
      if (!this.canCancelOrder(order)) {
        throw ApiError.BadRequest('Заказ нельзя отменить в текущем статусе');
      }
      
      // Освобождаем зарезервированные товары
      await this.releaseReservedProducts(order.items, session);
      
      // Обновляем статус заказа
      order.status = OrderStatus.CANCELLED;
      order.cancellation = {
        reason,
        cancelledBy: userId,
        cancelledAt: new Date()
      };
      
      order.statusHistory.push({
        status: OrderStatus.CANCELLED,
        changedAt: new Date(),
        changedBy: userId,
        comment: `Отменен пользователем: ${reason}`
      });
      
      await order.save({ session });
      await session.commitTransaction();
      
      // Инвалидируем кеш
      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(userId);
      
      // Отправляем уведомления
      await sendEmailNotification(
        process.env.SMTP_USER,
        'orderCancelledByUser',
        { orderData: order.toObject() }
      );
      
      logger.info(`[OrderService] Заказ ${orderId} отменен пользователем ${userId}`);
      
      return order;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[OrderService] Ошибка отмены заказа ${orderId}:`, error);
      throw error;
      
    } finally {
      session.endSession();
    }
  }

  // ========== ADMIN METHODS ==========

  /**
   * Получение всех заказов (для админа)
   */
  async getAdminOrders(filters = {}, pagination = {}) {
    try {
      // Пробуем получить из кеша
      const cacheKey = JSON.stringify({ filters, pagination });
      const cached = await this.cache.getAdminOrders(cacheKey);
      
      if (cached) {
        return cached;
      }

      const query = {};
      
      // Применяем фильтры
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
      }
      
      if (filters.search) {
        query.$or = [
          { orderNumber: { $regex: filters.search, $options: 'i' } },
          { 'recipient.fullName': { $regex: filters.search, $options: 'i' } },
          { 'recipient.email': { $regex: filters.search, $options: 'i' } },
          { 'recipient.phone': { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      if (filters.userId) {
        query.user = filters.userId;
      }

      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 20;
      const skip = (page - 1) * limit;

      const [orders, total] = await Promise.all([
        OrderModel.find(query)
          .populate('user', 'name email phone')
          .populate('items.product', 'title sku category')
          .populate('companyInfo.companyId', 'name')
          .populate('statusHistory.changedBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        OrderModel.countDocuments(query)
      ]);

      const result = {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };

      // Сохраняем в кеш
      await this.cache.setAdminOrders(cacheKey, result);
      
      return result;
      
    } catch (error) {
      logger.error(`[OrderService] Ошибка получения заказов админа:`, error);
      throw ApiError.DatabaseError('Ошибка при получении заказов');
    }
  }

  /**
   * Получение заказа по ID (для админа)
   */
  async getOrderById(orderId) {
    try {
      // Пробуем получить из кеша
      const cached = await this.cache.getOrder(orderId);
      if (cached) {
        return cached;
      }

      const order = await OrderModel.findById(orderId)
        .populate('user', 'name email phone address')
        .populate('items.product')
        .populate('companyInfo.companyId')
        .populate('statusHistory.changedBy', 'name email role')
        .populate('cancellation.cancelledBy', 'name email')
        .lean();

      if (!order) {
        throw ApiError.NotFound('Заказ не найден');
      }

      // Сохраняем в кеш
      await this.cache.setOrder(order);
      
      return order;
      
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[OrderService] Ошибка получения заказа ${orderId}:`, error);
      throw ApiError.DatabaseError('Ошибка при получении заказа');
    }
  }

  /**
   * Обновление статуса заказа (админом)
   */
  async updateOrderStatus(orderId, status, userId, comment = '') {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const order = await OrderModel.findById(orderId).session(session);
      
      if (!order) {
        throw ApiError.NotFound('Заказ не найден');
      }
      
      // Проверяем валидность перехода статусов
      if (!this.isValidStatusTransition(order.status, status)) {
        throw ApiError.BadRequest(`Невозможно сменить статус с ${order.status} на ${status}`);
      }
      
      // Обновляем статус
      const previousStatus = order.status;
      order.status = status;
      
      // Добавляем в историю
      order.statusHistory.push({
        status,
        changedAt: new Date(),
        changedBy: userId,
        comment,
        metadata: { previousStatus }
      });
      
      // Обработка специфичных статусов
      if (status === OrderStatus.CANCELLED) {
        // Освобождаем зарезервированные товары
        await this.releaseReservedProducts(order.items, session);
      }
      
      if (status === OrderStatus.SHIPPED && order.delivery.trackingNumber) {
        // Отправляем уведомление об отправке
        await this.sendShippingNotification(order);
      }
      
      if (status === OrderStatus.READY_FOR_PICKUP && order.delivery.method === DeliveryMethod.PICKUP) {
        // Отправляем уведомление о готовности к выдаче
        await this.sendPickupReadyNotification(order);
      }
      
      await order.save({ session });
      await session.commitTransaction();
      
      // Инвалидируем кеш
      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(order.user.toString());
      
      logger.info(`[OrderService] Статус заказа ${orderId} изменен: ${previousStatus} -> ${status}`);
      
      return order;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[OrderService] Ошибка обновления статуса заказа ${orderId}:`, error);
      throw error;
      
    } finally {
      session.endSession();
    }
  }

  /**
   * Отмена заказа админом
   */
  async cancelOrderByAdmin(orderId, adminId, reason, refundAmount = null) {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const order = await OrderModel.findById(orderId).session(session);
      
      if (!order) {
        throw ApiError.NotFound('Заказ не найден');
      }
      
      // Освобождаем зарезервированные товары
      await this.releaseReservedProducts(order.items, session);
      
      // Обновляем заказ
      order.status = OrderStatus.CANCELLED;
      order.cancellation = {
        reason,
        cancelledBy: adminId,
        cancelledAt: new Date(),
        refundAmount,
        notes: `Отменен администратором: ${reason}`
      };
      
      order.statusHistory.push({
        status: OrderStatus.CANCELLED,
        changedAt: new Date(),
        changedBy: adminId,
        comment: reason
      });
      
      // Если был оплачен - отмечаем возврат
      if (order.payment.status === 'paid' && refundAmount) {
        order.payment.status = 'refunded';
      }
      
      await order.save({ session });
      await session.commitTransaction();
      
      // Инвалидируем кеш
      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(order.user.toString());
      
      // Отправляем уведомления
      await this.sendOrderCancelledNotification(order, reason, refundAmount);
      
      logger.info(`[OrderService] Заказ ${orderId} отменен администратором ${adminId}`);
      
      return order;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[OrderService] Ошибка отмены заказа администратором ${orderId}:`, error);
      throw error;
      
    } finally {
      session.endSession();
    }
  }

  // ========== UTILITY METHODS ==========

  /**
   * Расчет стоимости доставки
   */
  calculateShippingCost(deliveryData, items) {
    // Здесь должна быть логика расчета доставки
    // Можно интегрировать с внешними службами доставки
    // const baseCost = 300; // Базовая стоимость
    // const weight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
    
    // if (deliveryData.method === DeliveryMethod.PICKUP) {
    //   return 0;
    // }
    
    // // Пример: +50 рублей за каждый кг свыше 5кг
    // const extraWeight = Math.max(0, weight - 5);
    // return baseCost + (extraWeight * 50);
    return 500;
  }

  /**
   * Расчет налога
   */
  calculateTax(subtotal, orderData) {
    // Логика расчета налога в зависимости от страны/региона
    // if (orderData.companyInfo && orderData.companyInfo.taxNumber) {
    //   // Для компаний с НДС
    //   return subtotal * 0.20; // 20% НДС
    // }
    return 0;
  }

  /**
   * Проверка возможности отмены заказа
   */
  canCancelOrder(order) {
    const cancellableStatuses = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING
    ];
    return cancellableStatuses.includes(order.status);
  }

  /**
   * Проверка валидности перехода статусов
   */
  isValidStatusTransition(fromStatus, toStatus) {
    const transitions = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
      [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
      [OrderStatus.REFUNDED]: []
    };
    
    return transitions[fromStatus]?.includes(toStatus) || false;
  }

  /**
   * Освобождение зарезервированных товаров
   */
  async releaseReservedProducts(items, session) {
    const updates = [];
    
    for (const item of items) {
      const product = await ProductModel.findById(item.product).session(session);
      if (product) {
        product.reservedQuantity = Math.max(0, (product.reservedQuantity || 0) - item.quantity);
        updates.push(product.save({ session }));
      }
    }
    
    await Promise.all(updates);
  }

  /**
   * Отправка уведомлений о создании заказа
   */
  async sendOrderNotifications(order, user) {
    try {
      // Администратору
      await sendEmailNotification(
        process.env.SMTP_USER,
        'newOrderAdmin',
        {
          orderNumber: order.orderNumber,
          orderData: order.toObject(),
          customer: user
        },
        true
      );
      
      // Пользователю
      await sendEmailNotification(
        user.email,
        'newOrderUser',
        {
          orderNumber: order.orderNumber,
          orderData: order.toObject(),
          customer: user
        }
      );
      
    } catch (error) {
      logger.error(`[OrderService] Ошибка отправки уведомлений для заказа ${order.orderNumber}:`, error);
      // Не прерываем выполнение при ошибке отправки email
    }
  }

  /**
   * Отправка уведомления об отправке
   */
  async sendShippingNotification(order) {
    try {
      const populatedOrder = await OrderModel.findById(order._id)
        .populate('user', 'email name');
      
      if (populatedOrder && populatedOrder.user) {
        await sendEmailNotification(
          populatedOrder.user.email,
          'orderShipped',
          {
            orderNumber: order.orderNumber,
            trackingNumber: order.delivery.trackingNumber,
            carrier: order.delivery.carrier,
            estimatedDelivery: order.delivery.estimatedDelivery
          }
        );
      }
    } catch (error) {
      logger.error(`[OrderService] Ошибка отправки уведомления об отправке ${order.orderNumber}:`, error);
    }
  }

  /**
   * Отправка уведомления о готовности к выдаче
   */
  async sendPickupReadyNotification(order) {
    try {
      const populatedOrder = await OrderModel.findById(order._id)
        .populate('user', 'email name');
      
      if (populatedOrder && populatedOrder.user) {
        await sendEmailNotification(
          populatedOrder.user.email,
          'orderReadyForPickup',
          {
            orderNumber: order.orderNumber,
            pickupPoint: order.delivery.pickupPoint,
            orderData: order.toObject()
          }
        );
      }
    } catch (error) {
      logger.error(`[OrderService] Ошибка отправки уведомления о готовности ${order.orderNumber}:`, error);
    }
  }

  /**
   * Отправка уведомления об отмене
   */
  async sendOrderCancelledNotification(order, reason, refundAmount) {
    try {
      const populatedOrder = await OrderModel.findById(order._id)
        .populate('user', 'email name');
      
      if (populatedOrder && populatedOrder.user) {
        await sendEmailNotification(
          populatedOrder.user.email,
          'orderCancelledByAdmin',
          {
            orderNumber: order.orderNumber,
            reason,
            refundAmount,
            orderData: order.toObject()
          }
        );
      }
    } catch (error) {
      logger.error(`[OrderService] Ошибка отправки уведомления об отмене ${order.orderNumber}:`, error);
    }
  }
}

module.exports = new OrderService();