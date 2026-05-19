import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import { DeliveryMethod } from "../models/index.models.js";
import OrderService from "../services/ordersService.js";
import type {
  AdminCancelOrderReq,
  AdminCancelOrderResponse,
  CancelOrderReq,
  CancelOrderResponse,
  CreateOrderReq,
  CreateOrderResponse,
  DeleteAttachmentReq,
  DeleteAttachmentResponse,
  GetAdminOrderReq,
  GetAdminOrdersReq,
  GetAdminOrdersResponse,
  GetOrderReq,
  GetOrdersReq,
  GetOrdersResponse,
  UpdateOrderStatusReq,
  UpdateOrderStatusResponse,
  UploadAttachmentReq,
  UploadAttachmentResponse,
} from "../types/controllers/orders-controller.js";
import {
  type DeliveryMethodType,
  type IOrder,
  type OrderSourceType,
  OrderStatus,
  type OrderStatusType,
  PaymentMethod,
  type PaymentMethodType,
} from "../types/order.types.js";

class OrdersController {
  // ========== USER ENDPOINTS ==========

  /**
   * Получение заказов пользователя
   * GET /api/orders
   */
  getOrders = async (
    req: GetOrdersReq,
    res: Response<GetOrdersResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as OrderStatusType | undefined;
      // Проверяем, что статус валидный, если передан
      if (status && !Object.values(OrderStatus).includes(status)) {
        throw ApiError.BadRequest(`Некорректный статус: ${status}`);
      }

      const filters = {
        status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
      };

      const orders = await OrderService.getUserOrders(req.user.id, filters);
      res.status(200).json(orders as GetOrdersResponse);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение конкретного заказа
   * GET /api/orders/:id
   */
  getOrder = async (
    req: GetOrderReq,
    res: Response<IOrder>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const order = await OrderService.getUserOrder(id, req.user.id);
      res.status(200).json(order as IOrder);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Создание заказа
   * POST /api/orders
   */
  createOrder = async (
    req: CreateOrderReq,
    res: Response<CreateOrderResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { deliveryMethod, paymentMethod } = req.body;

      // Приводим строки к union-типам с проверкой
      if (!Object.values(DeliveryMethod).includes(deliveryMethod as any)) {
        throw ApiError.BadRequest(
          `Некорректный способ доставки: ${deliveryMethod}`,
        );
      }
      if (!Object.values(PaymentMethod).includes(paymentMethod as any)) {
        throw ApiError.BadRequest(
          `Некорректный способ оплаты: ${paymentMethod}`,
        );
      }

      const orderData = {
        ...req.body,
        deliveryMethod: deliveryMethod as DeliveryMethodType,
        paymentMethod: paymentMethod as PaymentMethodType,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent") ?? undefined,
        source: "web" as OrderSourceType,
      };

      // Дополнительная проверка совместимости способов доставки и оплаты
      if (orderData.deliveryMethod === DeliveryMethod.DOOR_TO_DOOR) {
        if (orderData.paymentMethod !== PaymentMethod.INVOICE) {
          throw ApiError.BadRequest(
            "Для доставки до двери доступна только оплата по счету",
          );
        }
      } else if (orderData.deliveryMethod === DeliveryMethod.PICKUP_POINT) {
        if (orderData.paymentMethod !== PaymentMethod.INVOICE) {
          throw ApiError.BadRequest(
            "Для доставки в ПВЗ доступна только оплата по счету или при получении в ПВЗ",
          );
        }
      } else if (orderData.deliveryMethod === DeliveryMethod.SELF_PICKUP) {
        if (
          orderData.paymentMethod !== PaymentMethod.INVOICE &&
          orderData.paymentMethod !== PaymentMethod.SELF_PICKUP_CARD &&
          orderData.paymentMethod !== PaymentMethod.SELF_PICKUP_CASH
        ) {
          throw ApiError.BadRequest(
            "Для самовывоза доступна только оплата по счету, картой или наличными при самовывозе",
          );
        }
      }

      const order = await OrderService.createOrder(req.user, orderData);

      res.status(201).json({
        success: true,
        orderNumber: order.orderNumber,
        orderId: order._id.toString(),
        message: "Заказ успешно создан",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отмена заказа пользователем
   * POST /api/orders/:id/cancel
   */
  cancelOrder = async (
    req: CancelOrderReq,
    res: Response<CancelOrderResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason || reason.trim().length < 5) {
        throw ApiError.BadRequest(
          "Укажите причину отмены (минимум 5 символов)",
        );
      }

      const order = await OrderService.cancelOrderByUser(
        id,
        req.user.id,
        reason,
      );
      res.status(200).json({
        success: true,
        message: "Заказ успешно отменен",
        orderNumber: order.orderNumber,
      });
    } catch (error) {
      next(error);
    }
  };

  // ========== ADMIN ENDPOINTS ==========

  /**
   * Получение всех заказов (админ)
   * GET /api/admin/orders
   */
  getAdminOrders = async (
    req: GetAdminOrdersReq,
    res: Response<GetAdminOrdersResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as OrderStatusType | undefined;
      if (status && !Object.values(OrderStatus).includes(status)) {
        throw ApiError.BadRequest(`Некорректный статус: ${status}`);
      }

      const filters = {
        status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
        userId: req.query.userId,
      };

      const pagination = {
        page: req.query.page,
        limit: req.query.limit,
      };

      const result = await OrderService.getAdminOrders(filters, pagination);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение заказа по ID (админ)
   * GET /api/admin/orders/:id
   */
  getAdminOrder = async (
    req: GetAdminOrderReq,
    res: Response<IOrder>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const order = await OrderService.getOrderById(id);
      res.status(200).json(order as IOrder);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновление статуса заказа (админ)
   * PATCH /api/admin/orders/:id/status
   */
  updateOrderStatus = async (
    req: UpdateOrderStatusReq,
    res: Response<UpdateOrderStatusResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { status, comment } = req.body;

      if (!status) {
        throw ApiError.BadRequest("Статус обязателен");
      }
      if (!Object.values(OrderStatus).includes(status)) {
        throw ApiError.BadRequest(`Некорректный статус: ${status}`);
      }

      const order = await OrderService.updateOrderStatus(
        id,
        status,
        req.user.id,
        comment ?? "",
      );

      res.status(200).json({
        success: true,
        message: "Статус заказа обновлен",
        orderNumber: order.orderNumber,
        newStatus: order.status,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отмена заказа админом
   * POST /api/admin/orders/:id/cancel
   */
  cancelOrderAdmin = async (
    req: AdminCancelOrderReq,
    res: Response<AdminCancelOrderResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason, refundAmount } = req.body;

      if (!reason || reason.trim().length < 5) {
        throw ApiError.BadRequest(
          "Укажите причину отмены (минимум 5 символов)",
        );
      }

      const order = await OrderService.cancelOrderByAdmin(
        id,
        req.user.id,
        reason,
        refundAmount ?? null,
      );

      res.status(200).json({
        success: true,
        message: "Заказ успешно отменен",
        orderNumber: order.orderNumber,
        refundAmount: refundAmount ?? 0,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Загрузка файла для заказа
   * POST /api/admin/orders/:id/attachments
   */
  uploadAttachment = async (
    req: UploadAttachmentReq,
    res: Response<UploadAttachmentResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { filePath } = req.body;
      const userId = req.user.id;

      if (!filePath) {
        throw ApiError.BadRequest("Путь к файлу не указан");
      }

      const order = await OrderService.uploadAttachment(id, filePath, userId);
      const typedOrder = order as IOrder;
      const lastAttachment =
        typedOrder.attachments?.[typedOrder.attachments.length - 1];

      res.status(200).json({
        success: true,
        message: "Файл успешно загружен",
        order: typedOrder,
        attachment: lastAttachment!,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удаление файла заказа (админ)
   * DELETE /api/admin/orders/:id/attachments/:fileId
   */
  deleteAttachment = async (
    req: DeleteAttachmentReq,
    res: Response<DeleteAttachmentResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, fileId } = req.params;
      const userId = req.user.id;

      const order = await OrderService.deleteAttachment(id, fileId, userId);

      res.status(200).json({
        success: true,
        message: "Файл успешно удален",
        order: order as IOrder,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new OrdersController();
