// controllers/orders.controller.js
const ApiError = require("../exceptions/api-error");
const { DeliveryMethod, PaymentMethod } = require("../models/order-model");
const OrderService = require("../services/ordersService");

class OrdersController {
  // ========== USER ENDPOINTS ==========
  
  /**
   * Получение заказов пользователя
   * GET /api/orders
   */
  async getOrders(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search
      };
      
      const orders = await OrderService.getUserOrders(req.user.id, filters);
      res.status(200).json(orders);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Получение конкретного заказа
   * GET /api/orders/:id
   */
  async getOrder(req, res, next) {
    try {
      const { id } = req.params;
      const order = await OrderService.getUserOrder(id, req.user.id);
      res.status(200).json(order);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Создание заказа
   * POST /api/orders
   */
  async createOrder(req, res, next) {
  try {
    const orderData = {
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      source: 'web'
    };
    
    // Дополнительная проверка совместимости способов доставки и оплаты
    const { deliveryMethod, paymentMethod } = orderData;
    
    if (deliveryMethod === DeliveryMethod.DOOR_TO_DOOR) {
      if (paymentMethod !== PaymentMethod.INVOICE && 
          paymentMethod !== PaymentMethod.COURIER_CASH) {
        throw ApiError.BadRequest(
          'Для доставки до двери доступна только оплата по счету или курьеру'
        );
      }
    } else if (deliveryMethod === DeliveryMethod.PICKUP_POINT) {
      if (paymentMethod !== PaymentMethod.INVOICE && 
          paymentMethod !== PaymentMethod.PICKUP_POINT_CASH) {
        throw ApiError.BadRequest(
          'Для доставки в ПВЗ доступна только оплата по счету или при получении в ПВЗ'
        );
      }
    } else if (deliveryMethod === DeliveryMethod.SELF_PICKUP) {
      if (paymentMethod !== PaymentMethod.INVOICE && 
          paymentMethod !== PaymentMethod.SELF_PICKUP_CARD && 
          paymentMethod !== PaymentMethod.SELF_PICKUP_CASH) {
        throw ApiError.BadRequest(
          'Для самовывоза доступна только оплата по счету, картой или наличными при самовывозе'
        );
      }
    }
    
    const order = await OrderService.createOrder(req.user, orderData);
    
    res.status(201).json({
      success: true,
      orderNumber: order.orderNumber,
      orderId: order._id,
      message: 'Заказ успешно создан'
    });
  } catch (error) {
    next(error);
  }
}

  
  /**
   * Отмена заказа пользователем
   * POST /api/orders/:id/cancel
   */
  async cancelOrder(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!reason || reason.trim().length < 5) {
        throw ApiError.BadRequest('Укажите причину отмены (минимум 5 символов)');
      }
      
      const order = await OrderService.cancelOrderByUser(id, req.user.id, reason);
      res.status(200).json({
        success: true,
        message: 'Заказ успешно отменен',
        orderNumber: order.orderNumber
      });
    } catch (error) {
      next(error);
    }
  }
  
  // ========== ADMIN ENDPOINTS ==========
  
  /**
   * Получение всех заказов (админ)
   * GET /api/admin/orders
   */
  async getAdminOrders(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
        userId: req.query.userId
      };
      
      const pagination = {
        page: req.query.page || 1,
        limit: req.query.limit || 50
      };
      
      const result = await OrderService.getAdminOrders(filters, pagination);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Получение заказа по ID (админ)
   * GET /api/admin/orders/:id
   */
  async getAdminOrder(req, res, next) {
    try {
      const { id } = req.params;
      const order = await OrderService.getOrderById(id);
      res.status(200).json(order);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Обновление статуса заказа (админ)
   * PATCH /api/admin/orders/:id/status
   */
  async updateOrderStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, comment } = req.body;
      
      if (!status) {
        throw ApiError.BadRequest('Статус обязателен');
      }
      
      const order = await OrderService.updateOrderStatus(
        id, 
        status, 
        req.user.id, 
        comment || ''
      );
      
      res.status(200).json({
        success: true,
        message: 'Статус заказа обновлен',
        orderNumber: order.orderNumber,
        newStatus: order.status
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Отмена заказа админом
   * POST /api/admin/orders/:id/cancel
   */
  async cancelOrderAdmin(req, res, next) {
    try {
      const { id } = req.params;
      const { reason, refundAmount } = req.body;
      
      if (!reason || reason.trim().length < 5) {
        throw ApiError.BadRequest('Укажите причину отмены (минимум 5 символов)');
      }
      
      const order = await OrderService.cancelOrderByAdmin(
        id, 
        req.user.id, 
        reason, 
        refundAmount
      );
      
      res.status(200).json({
        success: true,
        message: 'Заказ успешно отменен',
        orderNumber: order.orderNumber,
        refundAmount: refundAmount || 0
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Загрузка файла для заказа
   * POST /api/admin/orders/:id/attachments
   */
  async uploadAttachment(req, res, next) {
    try {
      const { id } = req.params;
      const { filePath } = req.body;
      const userId = req.user.id;
      
      if (!filePath) {
        throw ApiError.BadRequest('Путь к файлу не указан');
      }
      
      // Вызываем сервисный метод
      const order = await OrderService.uploadAttachment(id, filePath, userId);
      
      // Находим последнее добавленное вложение
      const lastAttachment = order.attachments[order.attachments.length - 1];
      
      res.status(200).json({
        success: true,
        message: 'Файл успешно загружен',
        order,
        attachment: lastAttachment
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Удаление файла заказа (админ)
   * DELETE /api/admin/orders/:id/attachments/:fileId
   */
  async deleteAttachment(req, res, next) {
    try {
      const { id, fileId } = req.params;
      const userId = req.user.id;
      
      // Вызываем сервисный метод
      const order = await OrderService.deleteAttachment(id, fileId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Файл успешно удален',
        order
      });
    } catch (error) {
      next(error);
    }
  }

}

module.exports = new OrdersController();