// services/orders.service.ts
//@ts-nocheck
import { promises as fs } from "node:fs";
import { basename, dirname } from "node:path";
import { type ClientSession, startSession, Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import {
  DeliveryMethod,
  OrderModel,
  OrderStatus,
  ProductModel,
  UserModel,
} from "../models/index.models.js";
import {
  sendEmailNotification,
  sendPushNotification,
} from "../queues/taskQueues.js";
import type {
  IOrder,
  OrderDocument,
  PaymentMethod,
} from "../types/order.types.js";
import type { ProductDocument } from "../types/product.types.js";
import type { UserDocument } from "../types/user.types.js";
import fileService from "../utils/fileManager.js";
import { mapOrderToEmailData } from "../utils/orderUtils.js";
import CartService from "./cartService.js";
import CompanyService from "./companyService.js";
import DiscountService from "./discountService.js";
import fileStorageService from "./fileStorage.service.js";
import OrderCacheService from "./OrderCacheService.js";
import ProductService from "./productService.js";
import type { TokenPayload } from "./tokenService.js";

// ========== ЛОКАЛЬНЫЕ ТИПЫ ==========
interface CreateOrderData {
  deliveryMethod: DeliveryMethodType;
  deliveryAddress?: IDeliveryAddress;
  pickupPointId?: string;
  transportCompanyId?: string;
  deliveryNotes?: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  paymentMethod: PaymentMethodType;
  isCompany?: boolean;
  existingCompanyId?: string;
  newCompanyData?: {
    companyName: string;
    companyAddress: string;
    taxNumber: string;
    legalAddress?: string;
    contactPerson?: string;
  };
  awaitingInvoice?: boolean;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
  source?: OrderSourceType;
}

interface OrderFilters {
  status?: OrderStatusType;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  search?: string;
  userId?: string;
}

interface PaginationParams {
  page?: number | string;
  limit?: number | string;
}

interface CartResponse {
  items: CartItem[];
  summary: {
    priceWithoutDiscount: number;
    totalPrice: number;
    productDiscountAmount: number;
    centralDiscountAmount: number;
    centralDiscountPercent: number;
  };
  discounts: {
    applied: AppliedDiscount[];
  };
  validation: {
    isValid: boolean;
    issues?: unknown[];
  };
}

interface CartItem {
  product: {
    _id: Types.ObjectId;
    sku: string;
    price: number;
    finalPrice: number;
  };
  quantity: number;
  discount: number;
}

interface AppliedDiscount {
  _id: Types.ObjectId;
  name: string;
  type: string;
  discountPercent?: number;
  amount: number;
  condition?: Record<string, unknown>;
}

interface CompanyData {
  _id: Types.ObjectId;
  companyName: string;
  companyAddress: string;
  taxNumber: string;
  legalAddress?: string;
  contactPerson?: string;
}

interface ShippingNotificationOrder {
  _id: Types.ObjectId;
  orderNumber: string;
  delivery: {
    trackingNumber?: string;
    carrier?: string;
    estimatedDelivery?: Date;
    pickupPoint?: Types.ObjectId;
  };
  user: Types.ObjectId | { _id: Types.ObjectId; email: string; name: string };
}

// Типы для enum-объектов
type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];
type DeliveryMethodType = (typeof DeliveryMethod)[keyof typeof DeliveryMethod];
type PaymentMethodType = (typeof PaymentMethod)[keyof typeof PaymentMethod];
type OrderSourceType = "web" | "mobile" | "api" | "admin";

interface IDeliveryAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

// Кэш-структура для админских заказов
interface AdminOrdersCacheData {
  orders: IOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

class OrderService {
  private readonly cartService: typeof CartService;
  private readonly productService: typeof ProductService;
  private readonly cache: typeof OrderCacheService;
  private readonly discountService: typeof DiscountService;

  constructor() {
    this.cartService = CartService;
    this.productService = ProductService;
    this.cache = OrderCacheService;
    this.discountService = DiscountService;
  }

  // ========== PUBLIC METHODS ==========
  async createOrder(
    user: TokenPayload,
    orderData: CreateOrderData,
  ): Promise<OrderDocument> {
    const session = await startSession();
    if (!user.id) throw ApiError.BadRequest("User not found");

    try {
      session.startTransaction();

      const cart = (await this.cartService.getCart(user.id)) as CartResponse;
      if (!cart.items || cart.items.length === 0) {
        throw ApiError.BadRequest("Корзина пуста");
      }
      if (!cart.validation.isValid) {
        throw ApiError.BadRequest(
          "Корзина содержит ошибки",
          cart.validation.issues,
        );
      }

      const productUpdates: Promise<ProductDocument>[] = [];
      const orderItems: Array<{
        product: Types.ObjectId;
        sku: string;
        name: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        totalPrice: number;
        weight?: number;
        dimensions?: { length?: number; width?: number; height?: number };
      }> = [];

      for (const item of cart.items) {
        const product = await ProductModel.findById(item.product._id).session(
          session,
        );
        if (!product) {
          throw ApiError.NotFoundError(`Товар ${item.product.sku} не найден`);
        }
        if (product.status !== "available" && product.status !== "preorder") {
          throw ApiError.BadRequest(
            `Товар ${product.title} недоступен для заказа`,
          );
        }
        productUpdates.push(product.save({ session }));

        const unitPrice = item.product.finalPrice || item.product.price;
        orderItems.push({
          product: product._id,
          sku: product.sku,
          name: product.title,
          quantity: item.quantity,
          unitPrice,
          discount: item.discount || 0,
          totalPrice: unitPrice * item.quantity,
          weight: product.weight,
          dimensions: product.dimensions,
        });
      }

      const {
        priceWithoutDiscount = 0,
        totalPrice = 0,
        productDiscountAmount = 0,
        centralDiscountAmount = 0,
        centralDiscountPercent = 0,
      } = cart.summary;

      const shippingCost = 0;
      const tax = this.calculateTax(totalPrice, orderData);
      const total = totalPrice + shippingCost + tax;

      const appliedDiscounts = cart.discounts.applied.map((discount) => ({
        discountId: discount._id,
        name: discount.name,
        type: discount.type as
          | "quantity_based"
          | "amount_based"
          | "percentage_based",
        discountPercent: discount.discountPercent,
        discountAmount: discount.amount,
        condition: discount.condition || {},
        appliedAt: new Date(),
      }));

      let companyInfo: {
        companyId: Types.ObjectId;
        name: string;
        address: string;
        taxNumber: string;
        legalAddress?: string;
        contactPerson?: string;
      } | null = null;
      let createdCompany: CompanyData | null = null;

      if (orderData.isCompany) {
        if (orderData.existingCompanyId) {
          try {
            const existingCompany = (await CompanyService.getCompanyById(
              user.id,
              orderData.existingCompanyId,
            )) as CompanyData;
            companyInfo = {
              companyId: existingCompany._id,
              name: existingCompany.companyName,
              address: existingCompany.companyAddress,
              taxNumber: existingCompany.taxNumber,
              legalAddress: existingCompany.legalAddress,
              contactPerson: existingCompany.contactPerson,
            };
            logger.info(
              `[OrderService] Использована существующая компания ${existingCompany._id} для заказа`,
            );
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
              throw ApiError.BadRequest(
                "Указанная компания не найдена или у вас нет к ней доступа",
              );
            }
            throw error;
          }
        } else if (orderData.newCompanyData) {
          try {
            const requiredFields: Array<keyof typeof orderData.newCompanyData> =
              ["companyName", "companyAddress", "taxNumber"];
            for (const field of requiredFields) {
              if (!orderData.newCompanyData[field]) {
                throw ApiError.BadRequest(
                  `Для создания компании укажите ${field}`,
                );
              }
            }
            createdCompany = (await CompanyService.createCompany(user.id, {
              companyName: orderData.newCompanyData.companyName,
              legalAddress:
                orderData.newCompanyData.legalAddress ||
                orderData.newCompanyData.companyAddress,
              companyAddress: orderData.newCompanyData.companyAddress,
              taxNumber: orderData.newCompanyData.taxNumber,
              contactPerson:
                orderData.newCompanyData.contactPerson ||
                orderData.recipientName,
              phone: orderData.recipientPhone,
              email: orderData.recipientEmail,
            })) as CompanyData;
            companyInfo = {
              companyId: createdCompany._id,
              name: createdCompany.companyName,
              address: createdCompany.companyAddress,
              taxNumber: createdCompany.taxNumber,
              legalAddress: createdCompany.legalAddress,
              contactPerson: createdCompany.contactPerson,
            };
            logger.info(
              `[OrderService] Создана новая компания ${createdCompany._id} для заказа`,
            );
          } catch (error) {
            if (
              error instanceof ApiError &&
              error.message.includes("ИНН уже существует")
            ) {
              try {
                const existingCompany =
                  (await CompanyService.getCompanyByTaxNumber(
                    user.id,
                    orderData.newCompanyData.taxNumber.replace(/\s/g, ""),
                  )) as CompanyData;
                companyInfo = {
                  companyId: existingCompany._id,
                  name: existingCompany.companyName,
                  address: existingCompany.companyAddress,
                  taxNumber: existingCompany.taxNumber,
                  legalAddress: existingCompany.legalAddress,
                  contactPerson: existingCompany.contactPerson,
                };
                logger.info(
                  `[OrderService] Найдена существующая компания с ИНН ${existingCompany.taxNumber}, использована для заказа`,
                );
              } catch (_searchError) {
                throw error;
              }
            } else {
              throw error;
            }
          }
        } else {
          throw ApiError.BadRequest(
            "Для оформления заказа от компании укажите либо ID существующей компании, либо данные новой компании",
          );
        }
      }

      const order = new OrderModel({
        user: user.id,
        orderNumber: "temp",
        delivery: {
          method: orderData.deliveryMethod,
          address: orderData.deliveryAddress,
          pickupPoint:
            orderData.deliveryMethod === DeliveryMethod.SELF_PICKUP
              ? orderData.pickupPointId
              : undefined,
          transportCompany:
            orderData.deliveryMethod === DeliveryMethod.DOOR_TO_DOOR ||
            orderData.deliveryMethod === DeliveryMethod.PICKUP_POINT
              ? orderData.transportCompanyId
              : undefined,
          notes: orderData.deliveryNotes,
        },
        recipient: {
          fullName: orderData.recipientName,
          phone: orderData.recipientPhone,
          email: orderData.recipientEmail || user.email,
          contactPerson:
            orderData.newCompanyData?.contactPerson || orderData.recipientName,
        },
        companyInfo: companyInfo ?? undefined,
        items: orderItems,
        pricing: {
          subtotal: priceWithoutDiscount,
          discount: productDiscountAmount + centralDiscountAmount,
          shippingCost,
          tax,
          total,
          currency: "RUB",
          productDiscounts: productDiscountAmount,
          centralDiscountAmount,
          priceWithoutDiscount,
          centralDiscountPercent,
        },
        appliedDiscounts,
        payment: {
          method: orderData.paymentMethod,
          status: orderData.awaitingInvoice ? "pending" : "pending",
        },
        status: OrderStatus.PENDING,
        statusHistory: [
          {
            status: OrderStatus.PENDING,
            changedAt: new Date(),
            changedBy: user.id,
            comment: orderData.awaitingInvoice
              ? "Заказ создан, ожидает выставления счета"
              : "Заказ создан",
          },
        ],
        notes: orderData.notes,
        ipAddress: orderData.ipAddress,
        userAgent: orderData.userAgent,
        source: orderData.source || "web",
        companyCreated: !!createdCompany,
        companySelection: orderData.existingCompanyId
          ? { type: "existing", companyId: orderData.existingCompanyId }
          : orderData.newCompanyData
            ? { type: "new", taxNumber: orderData.newCompanyData.taxNumber }
            : null,
      });

      await Promise.all(productUpdates);
      await order.save({ session });
      await this.cartService.clearCart(user.id);
      await session.commitTransaction();

      for (const discount of cart.discounts.applied) {
        try {
          await this.discountService.incrementDiscountUsage(
            discount._id,
            discount.amount,
          );
          logger.info(
            `[OrderService] Увеличен счетчик использования скидки ${discount._id} на ${discount.amount}`,
          );
        } catch (error) {
          logger.error(
            `[OrderService] Ошибка увеличения счетчика скидки ${discount._id}:`,
            error,
          );
        }
      }

      await this.sendOrderNotifications(order, user);
      await this.cache.setOrder(order.toObject());
      await this.cache.invalidateUserCache(user.id);
      if (createdCompany) {
        await CompanyService.syncCacheAfterChanges(user.id);
      }

      logger.info(
        `[OrderService] Заказ создан: ${order.orderNumber} для пользователя ${user.id}`,
      );
      return order;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[OrderService] Ошибка создания заказа:`, error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private calculateTax(_subtotal: number, _orderData: CreateOrderData): number {
    return 0;
  }

  async getUserOrders(
    userId: string | Types.ObjectId,
    filters: OrderFilters = {},
  ): Promise<unknown[]> {
    try {
      const query: Record<string, unknown> = { user: userId };
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {} as Record<string, Date>;
        if (filters.dateFrom)
          (query.createdAt as Record<string, Date>).$gte = new Date(
            filters.dateFrom,
          );
        if (filters.dateTo)
          (query.createdAt as Record<string, Date>).$lte = new Date(
            filters.dateTo,
          );
      }
      if (filters.search) {
        query.$or = [
          { orderNumber: { $regex: filters.search, $options: "i" } },
          { "recipient.fullName": { $regex: filters.search, $options: "i" } },
        ];
      }

      const orders = await OrderModel.find(query)
        .populate("items.product", "title sku images")
        .populate("companyInfo.companyId")
        .populate({
          path: "delivery.pickupPoint",
          model: "PickupPoint",
          select: "name address coordinates workingHours contact description",
        })
        .populate({
          path: "attachments",
          select:
            "_id originalName name sizeBytes mimeType url accessType entityType entityId storedName storagePath",
        })
        .populate("appliedDiscounts.discountId", "name type discountPercent")
        .sort({ createdAt: -1 })
        .lean();

      return orders.map((order) =>
        this.processOrderForClient(order as unknown as IOrder),
      );
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка получения заказов пользователя ${userId}:`,
        error,
      );
      throw ApiError.DatabaseError("Ошибка при получении заказов");
    }
  }

  async getUserOrder(
    orderId: string,
    userId: string | Types.ObjectId,
  ): Promise<unknown> {
    try {
      const order = await OrderModel.findOne({ _id: orderId, user: userId })
        .populate("items.product")
        .populate("companyInfo.companyId")
        .populate({
          path: "delivery.pickupPoint",
          model: "PickupPoint",
          select:
            "name address coordinates workingHours contact description isActive",
        })
        .populate({
          path: "attachments",
          select:
            "_id originalName name sizeBytes mimeType url accessType entityType entityId storedName storagePath",
        })
        .populate("statusHistory.changedBy", "name email")
        .populate("appliedDiscounts.discountId", "name type discountPercent")
        .lean();

      if (!order) {
        throw ApiError.NotFoundError("Заказ не найден");
      }
      return this.processOrderForClient(order as unknown as IOrder);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[OrderService] Ошибка получения заказа ${orderId}:`, error);
      throw ApiError.DatabaseError("Ошибка при получении заказа");
    }
  }

  async cancelOrderByUser(
    orderId: string,
    userId: string,
    reason: string,
  ): Promise<OrderDocument> {
    const session = await startSession();
    try {
      session.startTransaction();
      const order = await OrderModel.findOne({
        _id: orderId,
        user: userId,
      }).session(session);
      if (!order) {
        throw ApiError.NotFoundError("Заказ не найден");
      }
      if (!this.canCancelOrder(order)) {
        throw ApiError.BadRequest("Заказ нельзя отменить в текущем статусе");
      }

      await this.releaseReservedProducts(order.items, session);
      order.status = OrderStatus.CANCELLED;
      order.cancellation = {
        reason,
        cancelledBy: new Types.ObjectId(userId),
        cancelledAt: new Date(),
      };
      order.statusHistory.push({
        status: OrderStatus.CANCELLED,
        changedAt: new Date(),
        changedBy: new Types.ObjectId(userId),
        comment: `Отменен пользователем: ${reason}`,
      });
      await order.save({ session });
      await session.commitTransaction();

      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(userId);
      await sendEmailNotification(
        process.env.SMTP_USER as string,
        "orderCancelledByUser",
        {
          order: mapOrderToEmailData(order.toObject()),
        },
      );

      await sendPushNotification({
        userId,
        title: "Заказ отменен",
        body: `Заказ №${order.orderNumber} отменен`,
        data: { order: order.toObject() },
      });

      logger.info(
        `[OrderService] Заказ ${orderId} отменен пользователем ${userId}`,
      );
      return order;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`[OrderService] Ошибка отмены заказа ${orderId}:`, error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // ========== ADMIN METHODS ==========
  async getAdminOrders(
    filters: OrderFilters = {},
    pagination: PaginationParams = {},
  ): Promise<AdminOrdersCacheData> {
    try {
      // Исправлено: передаём объект фильтрации, а не строку
      const cached = await this.cache.getAdminOrders({ filters, pagination });
      if (cached) {
        return cached as AdminOrdersCacheData;
      }

      const query: Record<string, unknown> = {};
      if (filters.status) query.status = filters.status;
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {} as Record<string, Date>;
        if (filters.dateFrom)
          (query.createdAt as Record<string, Date>).$gte = new Date(
            filters.dateFrom,
          );
        if (filters.dateTo)
          (query.createdAt as Record<string, Date>).$lte = new Date(
            filters.dateTo,
          );
      }
      if (filters.search) {
        query.$or = [
          { orderNumber: { $regex: filters.search, $options: "i" } },
          { "recipient.fullName": { $regex: filters.search, $options: "i" } },
          { "recipient.email": { $regex: filters.search, $options: "i" } },
          { "recipient.phone": { $regex: filters.search, $options: "i" } },
        ];
      }
      if (filters.userId) {
        query.user = filters.userId;
      }

      const page = parseInt(String(pagination.page), 10) || 1;
      const limit = parseInt(String(pagination.limit), 10) || 50;
      const skip = (page - 1) * limit;

      const [orders, total] = await Promise.all([
        OrderModel.find(query)
          .populate("user", "name email")
          .populate("items.product", "title sku category")
          .populate("companyInfo.companyId", "name")
          .populate("statusHistory.changedBy", "name email")
          .populate({
            path: "attachments",
            select:
              "_id originalName name sizeBytes mimeType url accessType entityType entityId storedName storagePath",
          })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        OrderModel.countDocuments(query),
      ]);

      const result: AdminOrdersCacheData = {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };

      await this.cache.setAdminOrders({ filters, pagination }, result);
      return result;
    } catch (error) {
      logger.error(`[OrderService] Ошибка получения заказов админа:`, error);
      throw ApiError.DatabaseError("Ошибка при получении заказов");
    }
  }

  async getOrderById(orderId: string): Promise<unknown> {
    try {
      const cached = await this.cache.getOrder(orderId);
      if (cached) return cached;

      const order = await OrderModel.findById(orderId)
        .populate("user", "name email address")
        .populate("items.product")
        .populate({
          path: "attachments",
          select:
            "_id originalName name sizeBytes mimeType url accessType entityType entityId storedName storagePath",
        })
        .populate("companyInfo.companyId")
        .populate("statusHistory.changedBy", "name email role")
        .populate("cancellation.cancelledBy", "name email")
        .lean();
      if (!order) throw ApiError.NotFoundError("Заказ не найден");
      await this.cache.setOrder(order);
      return order;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[OrderService] Ошибка получения заказа ${orderId}:`, error);
      throw ApiError.DatabaseError("Ошибка при получении заказа");
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatusType,
    userId: string,
    comment = "",
  ): Promise<OrderDocument> {
    const session = await startSession();
    try {
      session.startTransaction();
      const order = await OrderModel.findById(orderId).session(session);
      if (!order) throw ApiError.NotFoundError("Заказ не найден");
      if (!this.isValidStatusTransition(order.status, status)) {
        throw ApiError.BadRequest(
          `Невозможно сменить статус с ${order.status} на ${status}`,
        );
      }

      const previousStatus = order.status;
      order.status = status;
      order.statusHistory.push({
        status,
        changedAt: new Date(),
        changedBy: new Types.ObjectId(userId),
        comment,
        metadata: { previousStatus },
      });

      if (status === OrderStatus.CANCELLED) {
        await this.releaseReservedProducts(order.items, session);
      }
      if (status === OrderStatus.SHIPPED && order.delivery.trackingNumber) {
        await this.sendShippingNotification(order);
      }
      if (
        status === OrderStatus.READY_FOR_PICKUP &&
        order.delivery.method === DeliveryMethod.SELF_PICKUP
      ) {
        await this.sendPickupReadyNotification(
          order as unknown as ShippingNotificationOrder,
        );
      }

      await order.save({ session });
      await session.commitTransaction();

      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(order.user.toString());

      logger.info(
        `[OrderService] Статус заказа ${orderId} изменен: ${previousStatus} -> ${status}`,
      );
      return order;
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `[OrderService] Ошибка обновления статуса заказа ${orderId}:`,
        error,
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async cancelOrderByAdmin(
    orderId: string,
    adminId: string,
    reason: string,
    refundAmount: number | null = null,
  ): Promise<OrderDocument> {
    const session = await startSession();
    try {
      session.startTransaction();
      const order = await OrderModel.findById(orderId).session(session);
      if (!order) throw ApiError.NotFoundError("Заказ не найден");

      await this.releaseReservedProducts(order.items, session);
      order.status = OrderStatus.CANCELLED;
      order.cancellation = {
        reason,
        cancelledBy: new Types.ObjectId(adminId),
        cancelledAt: new Date(),
        refundAmount: refundAmount ?? undefined,
        notes: `Отменен администратором: ${reason}`,
      };
      order.statusHistory.push({
        status: OrderStatus.CANCELLED,
        changedAt: new Date(),
        changedBy: new Types.ObjectId(adminId),
        comment: reason,
      });
      if (order.payment.status === "paid" && refundAmount) {
        order.payment.status = "refunded";
      }
      await order.save({ session });
      await session.commitTransaction();

      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(order.user.toString());
      await this.sendOrderCancelledNotification(
        order,
        reason,
        refundAmount ?? undefined,
      );

      logger.info(
        `[OrderService] Заказ ${orderId} отменен администратором ${adminId}`,
      );
      return order;
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `[OrderService] Ошибка отмены заказа администратором ${orderId}:`,
        error,
      );
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // ========== UTILITY METHODS ==========
  private canCancelOrder(order: OrderDocument): boolean {
    const cancellableStatuses: OrderStatusType[] = [
      OrderStatus.PENDING,
      OrderStatus.AWAITING_INVOICE,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
    ];
    return cancellableStatuses.includes(order.status);
  }

  private isValidStatusTransition(
    fromStatus: OrderStatusType,
    toStatus: OrderStatusType,
  ): boolean {
    const transitions: Partial<Record<OrderStatusType, OrderStatusType[]>> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
      [OrderStatus.PACKED]: [
        OrderStatus.SHIPPED,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.READY_FOR_PICKUP]: [
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
      [OrderStatus.REFUNDED]: [],
    };
    return transitions[fromStatus]?.includes(toStatus) ?? false;
  }

  private async releaseReservedProducts(
    items: Array<{ product: Types.ObjectId }>,
    session: ClientSession,
  ) {
    const updates = [];
    for (const item of items) {
      const product = await ProductModel.findById(item.product).session(
        session,
      );
      if (product) {
        updates.push(product.save({ session }));
      }
    }
    await Promise.all(updates);
  }

  private async sendOrderNotifications(
    order: IOrder,
    user: TokenPayload,
  ): Promise<void> {
    if (!user.email) return;
    try {
      const admins = await UserModel.find({ role: "admin" });
      for (const admin of admins) {
        try {
          await sendEmailNotification(admin.email, "newOrderAdmin", {
            orderNumber: order.orderNumber,
            orderData: order,
            customer: user,
          });
          await sendPushNotification({
            userId: admin._id.toString(),
            title: "Новый заказ",
            body: `Новый заказ №${order.orderNumber}`,
          });
        } catch (error) {
          logger.error(
            `[OrderService] Ошибка отправки уведомления админу ${admin.email}:`,
            error,
          );
        }
      }
      await sendEmailNotification(user.email, "newOrderUser", {
        orderNumber: order.orderNumber,
        order: mapOrderToEmailData(order),
        customer: {
          id: user.id,
          email: user.email,
          name: order.recipient.fullName,
        },
      });
      await sendPushNotification({
        userId: user.id,
        title: "Новый заказ",
        body: `Новый заказ №${order.orderNumber}`,
      });
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка отправки уведомлений для заказа ${order.orderNumber}:`,
        error,
      );
    }
  }

  private async sendShippingNotification(order: IOrder): Promise<void> {
    try {
      const userEmail = order.recipient?.email;
      if (!userEmail) {
        logger.warn(
          `[OrderService] Нет email для уведомления об отправке заказа ${order.orderNumber}`,
        );
        return;
      }

      let estimatedDeliveryStr = "не указана";
      if (order.delivery.estimatedDelivery) {
        const date = new Date(order.delivery.estimatedDelivery);
        estimatedDeliveryStr = date.toLocaleDateString("ru-RU");
      }

      await sendEmailNotification(userEmail, "orderShipped", {
        orderNumber: order.orderNumber,
        order: mapOrderToEmailData(order),
        trackingNumber: order.delivery.trackingNumber || "отсутствует",
        carrier: order.delivery.carrier || "не указана",
        estimatedDelivery: estimatedDeliveryStr,
      });
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка отправки уведомления об отправке ${order.orderNumber}:`,
        error,
      );
    }
  }

  private async sendPickupReadyNotification(
    order: ShippingNotificationOrder,
  ): Promise<void> {
    try {
      const populatedOrder = await OrderModel.findById(order._id).populate<{
        user: { _id: Types.ObjectId; email: string; name: string };
        delivery: {
          pickupPoint: {
            name: string;
            address: { street?: string };
            workingHours?: string;
          } | null;
        };
      }>("user delivery.pickupPoint");

      if (!populatedOrder?.user) {
        logger.warn(
          `[OrderService] Нет пользователя для заказа ${order.orderNumber}`,
        );
        return;
      }

      const pickupPoint = populatedOrder.delivery.pickupPoint;
      if (!pickupPoint) {
        logger.warn(
          `[OrderService] Нет данных о пункте выдачи для заказа ${order.orderNumber} – уведомление не отправлено`,
        );
        return;
      }

      const pickupPointData = {
        name: pickupPoint.name || "Пункт выдачи",
        address: pickupPoint.address?.street || "адрес не указан",
        hours: pickupPoint.workingHours || "не указаны",
      };

      // Преобразуем заказ в EmailOrderData
      const orderForEmail = mapOrderToEmailData(populatedOrder.toObject());

      await sendEmailNotification(
        populatedOrder.user.email,
        "orderReadyForPickup",
        {
          order: orderForEmail,
          pickupPoint: pickupPointData,
        },
      );

      await sendPushNotification({
        userId: populatedOrder.user._id.toString(),
        title: "Ваш заказ готов к выдаче",
        body: `Заказ №${order.orderNumber} готов к выдаче`,
      });
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка отправки уведомления о готовности ${order.orderNumber}:`,
        error,
      );
    }
  }

  private async validateFile(fileId: string): Promise<string> {
    if (!fileId || fileId.trim() === "") {
      throw ApiError.BadRequest("ID файла не указан");
    }
    const exists = await fileStorageService.checkIfExists(fileId);
    if (!exists || (Array.isArray(exists) && exists.length === 0)) {
      throw ApiError.BadRequest(`Файл с ID "${fileId}" не найден или удалён`);
    }
    return fileId;
  }

  // ====================== ПРИКРЕПЛЕНИЕ ФАЙЛА ======================
  async uploadAttachment(
    orderId: string,
    fileId: string,
    userId: string,
  ): Promise<IOrder> {
    const order = await OrderModel.findById(orderId);
    if (!order) throw ApiError.NotFoundError("Заказ не найден");

    // Валидируем файл
    const validatedId = await this.validateFile(fileId);

    // Добавляем ID, если его ещё нет (защита от дублей)

    if (
      order.attachments ||
      order?.attachments.some((id: string) => id.toString() === validatedId)
    ) {
      order.attachments.push(validatedId);
      await order.save();
    }

    // Инвалидация кэша
    await this.cache.invalidateOrderCache(orderId);
    await this.cache.invalidateUserCache(order.user.toString());

    // Возвращаем заказ с populated файлами
    const updatedOrder = await OrderModel.findById(orderId)
      .populate("attachments")
      .lean();
    return updatedOrder as IOrder;
  }

  async deleteAttachment(
    orderId: string,
    fileId: string,
    userId: string,
  ): Promise<IOrder> {
    const order = await OrderModel.findById(orderId);
    if (!order) throw ApiError.NotFoundError("Заказ не найден");

    if (!order.attachments.some((id) => id.equals(fileId))) {
      throw ApiError.NotFoundError("Файл не прикреплён к заказу");
    }

    // Удаляем ID из массива
    order.attachments = order.attachments.filter((id) => !id.equals(fileId));
    await order.save();

    await fileStorageService.deleteFile(fileId, userId);
    // Инвалидация кэша
    await this.cache.invalidateOrderCache(orderId);
    await this.cache.invalidateUserCache(order.user.toString());

    const updatedOrder = await OrderModel.findById(orderId)
      .populate("attachments")
      .lean();
    return updatedOrder as IOrder;
  }

  private async sendOrderCancelledNotification(
    order: IOrder,
    reason: string,
    refundAmount?: number,
  ): Promise<void> {
    try {
      const userEmail = order.recipient?.email;
      if (!userEmail) {
        logger.warn(
          `[OrderService] Нет email для уведомления об отмене заказа ${order.orderNumber}`,
        );
        return;
      }
      await sendEmailNotification(userEmail, "orderCancelledByAdmin", {
        order: mapOrderToEmailData(order),
        reason,
        refundAmount,
        cancelledAt: order.cancellation?.cancelledAt || new Date(),
      });
      if (order.user) {
        const userId = order.user.toString();
        await sendPushNotification({
          userId,
          title: "Ваш заказ отменен",
          body: `Заказ №${order.orderNumber} отменен`,
        });
      }
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка отправки уведомления об отмене ${order.orderNumber}:`,
        error,
      );
    }
  }

  private processOrderForClient(order: IOrder): unknown {
    const processed = { ...order } as any;
    if (order.companyInfo?.companyId) {
      processed.company = order.companyInfo.companyId;
      processed.companyInfo = {
        ...order.companyInfo,
        name: (order.companyInfo.companyId as any)?.companyName,
        address: (order.companyInfo.companyId as any)?.companyAddress,
        taxNumber: (order.companyInfo.companyId as any)?.taxNumber,
        legalAddress: (order.companyInfo.companyId as any)?.legalAddress,
        contactPerson: (order.companyInfo.companyId as any)?.contactPerson,
      };
    }
    if (order.delivery?.pickupPoint) {
      processed.pickupPoint = order.delivery.pickupPoint;
      if ((processed.pickupPoint as any).address) {
        const addr = (processed.pickupPoint as any).address;
        (processed.pickupPoint as any).formattedAddress =
          `${addr.street}, ${addr.city}${addr.postalCode ? ` (${addr.postalCode})` : ""}`;
      }
    }
    if (order.appliedDiscounts?.length) {
      processed.discountDetails = {
        appliedDiscounts: order.appliedDiscounts,
        summary: {
          productDiscounts: (order.pricing as any).productDiscounts || 0,
          centralDiscounts: (order.pricing as any).centralDiscountAmount || 0,
          totalDiscount: order.pricing.discount || 0,
          priceWithoutDiscount:
            (order.pricing as any).priceWithoutDiscount || 0,
        },
      };
    }
    if ((order as any).attachments?.length) {
      processed.attachments = (order as any).attachments.map((a: any) => ({
        ...a,
        downloadUrl: fileService.getFileUrl(a.path),
      }));
    }
    return processed;
  }
}

export default new OrderService();
