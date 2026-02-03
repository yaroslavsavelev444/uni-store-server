// services/orders.service.js
const mongoose = require("mongoose");
const ApiError = require("../exceptions/api-error");
const CartService = require("./cartService");
const ProductService = require("./productService");
const OrderCacheService = require("./OrderCacheService");
const redisClient = require("../redis/redis.client");
const logger = require("../logger/logger");
const {
  sendEmailNotification,
  sendPushNotification,
} = require("../queues/taskQueues");
const {
  ProductModel,
  CompanyModel,
  OrderModel,
  OrderStatus,
  DeliveryMethod,
  UserModel,
} = require("../models/index.models");
const fileService = require("../utils/fileManager");
const path = require("path");
const CompanyService = require("./companyService");
const fs = require("fs").promises;
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
  // services/orders.service.js (фрагмент с исправлениями)

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
        throw ApiError.BadRequest("Корзина пуста");
      }

      // 2. Проверяем валидность корзины
      if (!cart.validation.isValid) {
        throw ApiError.BadRequest(
          "Корзина содержит ошибки",
          cart.validation.issues
        );
      }

      // 3. Проверяем доступность товаров и резервируем
      const productUpdates = [];
      const orderItems = [];

      for (const item of cart.items) {
        const product = await ProductModel.findById(item.product._id).session(
          session
        );

        if (!product) {
          throw ApiError.NotFound(`Товар ${item.product.sku} не найден`);
        }

        if (product.status !== "available" && product.status !== "preorder") {
          throw ApiError.BadRequest(
            `Товар ${product.title} недоступен для заказа`
          );
        }

        // Резервируем товар
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
          dimensions: product.dimensions,
        });
      }

      // 4. Рассчитываем стоимость (ИСКЛЮЧАЕМ ДОСТАВКУ)
      const subtotal = orderItems.reduce(
        (sum, item) => sum + item.totalPrice,
        0
      );
      
      // ИСКЛЮЧАЕМ расчет стоимости доставки
      const shippingCost = 0; // Устанавливаем 0 вместо расчета
      
      const tax = this.calculateTax(subtotal, orderData);
      const total = subtotal + shippingCost + tax; // shippingCost = 0, не влияет на итог

      let companyInfo = null;
      let createdCompany = null;

      if (orderData.isCompany) {
        if (orderData.existingCompanyId) {
          try {
            const existingCompany = await CompanyService.getCompanyById(
              user.id,
              orderData.existingCompanyId
            );

            companyInfo = {
              companyId: existingCompany._id,
              name: existingCompany.companyName,
              address: existingCompany.companyAddress,
              taxNumber: existingCompany.taxNumber,
              legalAddress: existingCompany.legalAddress,
              contactPerson: existingCompany.contactPerson,
            };

            logger.info(
              `[OrderService] Использована существующая компания ${existingCompany._id} для заказа`
            );
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
              throw ApiError.BadRequest(
                "Указанная компания не найдена или у вас нет к ней доступа"
              );
            }
            throw error;
          }
        }
        // Случай 2: Создание новой компании
        else if (orderData.newCompanyData) {
          try {
            const requiredFields = [
              "companyName",
              "companyAddress",
              "taxNumber",
            ];
            for (const field of requiredFields) {
              if (!orderData.newCompanyData[field]) {
                throw ApiError.BadRequest(
                  `Для создания компании укажите ${field}`
                );
              }
            }

            createdCompany = await CompanyService.createCompany(user.id, {
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
            });

            companyInfo = {
              companyId: createdCompany._id,
              name: createdCompany.companyName,
              address: createdCompany.companyAddress,
              taxNumber: createdCompany.taxNumber,
              legalAddress: createdCompany.legalAddress,
              contactPerson: createdCompany.contactPerson,
            };

            logger.info(
              `[OrderService] Создана новая компания ${createdCompany._id} для заказа`
            );
          } catch (error) {
            if (
              error instanceof ApiError &&
              error.message.includes("ИНН уже существует")
            ) {
              // Пробуем найти существующую компанию с таким ИНН
              try {
                const existingCompany =
                  await CompanyService.getCompanyByTaxNumber(
                    user.id,
                    orderData.newCompanyData.taxNumber.replace(/\s/g, "")
                  );

                companyInfo = {
                  companyId: existingCompany._id,
                  name: existingCompany.companyName,
                  address: existingCompany.companyAddress,
                  taxNumber: existingCompany.taxNumber,
                  legalAddress: existingCompany.legalAddress,
                  contactPerson: existingCompany.contactPerson,
                };

                logger.info(
                  `[OrderService] Найдена существующая компания с ИНН ${existingCompany.taxNumber}, использована для заказа`
                );
              } catch (searchError) {
                throw error; // Если не нашли, возвращаем исходную ошибку
              }
            } else {
              throw error;
            }
          }
        } else {
          throw ApiError.BadRequest(
            "Для оформления заказа от компании укажите либо ID существующей компании, либо данные новой компании"
          );
        }
      }

      // 6. Создаем заказ
      const order = new OrderModel({
      user: user.id,
      orderNumber: "temp",
      delivery: {
        method: orderData.deliveryMethod,
        address: orderData.deliveryAddress,
        pickupPoint: orderData.deliveryMethod === DeliveryMethod.SELF_PICKUP 
          ? orderData.pickupPointId 
          : undefined,
        transportCompany: (orderData.deliveryMethod === DeliveryMethod.DOOR_TO_DOOR || 
                          orderData.deliveryMethod === DeliveryMethod.PICKUP_POINT)
          ? orderData.transportCompanyId 
          : undefined,
        notes: orderData.deliveryNotes,
      },
      recipient: {
        fullName: orderData.recipientName,
        phone: orderData.recipientPhone,
        email: orderData.recipientEmail || user.email,
        contactPerson: orderData.newCompanyData?.contactPerson || orderData.recipientName,
      },
      companyInfo: companyInfo,
      items: orderItems,
      pricing: {
        subtotal,
        discount: cart.summary.totalDiscount || 0,
        shippingCost, // Теперь здесь всегда 0
        tax,
        total,
        currency: "RUB",
      },
      payment: {
        method: orderData.paymentMethod,
        status: orderData.awaitingInvoice ? "pending" : "pending", // Для счета настраивается отдельно
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

      // 11. Инвалидируем кеш компаний, если была создана новая
      if (createdCompany) {
        await CompanyService.invalidateUserCompaniesCache(user.id);
      }

      logger.info(
        `[OrderService] Заказ создан: ${order.orderNumber} для пользователя ${user.id}`
      );

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
   * Расчет стоимости доставки (обновленный метод)
   */
  calculateShippingCost(deliveryMethod, deliveryData, items) {
    // Базовая логика расчета
    const baseCost = 500; // Базовая стоимость

    if (deliveryMethod === DeliveryMethod.PICKUP) {
      return 0;
    }

    // Рассчитываем вес заказа
    const weight = items.reduce((sum, item) => sum + (item.weight || 0), 0);

    // Пример: +50 рублей за каждый кг свыше 5кг
    const extraWeight = Math.max(0, weight - 5);
    return baseCost + extraWeight * 50;
  }

  /**
   * Получение заказов пользователя
   */
  async getUserOrders(userId, filters = {}) {
    try {
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
          { orderNumber: { $regex: filters.search, $options: "i" } },
          { "recipient.fullName": { $regex: filters.search, $options: "i" } },
        ];
      }

      // Получаем заказы с полными данными
      const orders = await OrderModel.find(query)
        .populate("items.product", "title sku mainImage")
        .populate("companyInfo.companyId") // Получаем ВСЕ данные компании
        .populate({
          path: "delivery.pickupPoint",
          model: "PickupPoint", // Явно указываем модель
          select: "name address coordinates workingHours contact description", // Выбираем нужные поля
        })
        .sort({ createdAt: -1 })
        .lean();

      // Обрабатываем данные компании
      const processedOrders = orders.map((order) => {
        const processedOrder = { ...order };

        // Преобразуем данные компании для удобства использования на клиенте
        if (order.companyInfo?.companyId) {
          // Если компания получена через populate, добавляем все данные
          processedOrder.company = order.companyInfo.companyId;

          // Также сохраняем старый формат для обратной совместимости
          processedOrder.companyInfo = {
            ...order.companyInfo,
            name: order.companyInfo.companyId?.companyName,
            address: order.companyInfo.companyId?.companyAddress,
            taxNumber: order.companyInfo.companyId?.taxNumber,
            legalAddress: order.companyInfo.companyId?.legalAddress,
            contactPerson: order.companyInfo.companyId?.contactPerson,
          };
        } else if (order.companyInfo) {
          // Если компания не была найдена, но есть данные в companyInfo
          processedOrder.company = {
            _id: order.companyInfo.companyId,
            companyName: order.companyInfo.name,
            companyAddress: order.companyInfo.address,
            taxNumber: order.companyInfo.taxNumber,
            legalAddress: order.companyInfo.legalAddress,
            contactPerson: order.companyInfo.contactPerson,
          };
        }

        // Преобразуем данные точки самовывоза
        if (order.delivery?.pickupPoint) {
          processedOrder.pickupPoint = order.delivery.pickupPoint;

          // Форматируем адрес для удобного отображения
          if (processedOrder.pickupPoint.address) {
            const addr = processedOrder.pickupPoint.address;
            processedOrder.pickupPoint.formattedAddress = `${addr.street}, ${
              addr.city
            }${addr.postalCode ? ` (${addr.postalCode})` : ""}`;
          }
        }

        // Добавляем полные URL к вложениям
        if (order.attachments && order.attachments.length > 0) {
          processedOrder.attachments = order.attachments.map((attachment) => ({
            ...attachment,
            downloadUrl: fileService.getFileUrl(attachment.path),
          }));
        }

        return processedOrder;
      });

      return processedOrders;
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка получения заказов пользователя ${userId}:`,
        error
      );
      throw ApiError.DatabaseError("Ошибка при получении заказов");
    }
  }

  /**
   * Получение конкретного заказа пользователя
   */
  async getUserOrder(orderId, userId) {
    try {
      const order = await OrderModel.findOne({
        _id: orderId,
        user: userId,
      })
        .populate("items.product")
        .populate("companyInfo.companyId") // Полные данные компании
        .populate({
          path: "delivery.pickupPoint",
          model: "PickupPoint",
          select:
            "name address coordinates workingHours contact description isActive",
        })
        .populate("statusHistory.changedBy", "name email")
        .lean();

      if (!order) {
        throw ApiError.NotFound("Заказ не найден");
      }

      // Обработка данных компании
      if (order.companyInfo?.companyId) {
        order.company = order.companyInfo.companyId;

        // Сохраняем старый формат для обратной совместимости
        order.companyInfo = {
          ...order.companyInfo,
          name: order.companyInfo.companyId?.companyName,
          address: order.companyInfo.companyId?.companyAddress,
          taxNumber: order.companyInfo.companyId?.taxNumber,
          legalAddress: order.companyInfo.companyId?.legalAddress,
          contactPerson: order.companyInfo.companyId?.contactPerson,
        };
      }

      // Обработка точки самовывоза
      if (order.delivery?.pickupPoint) {
        order.pickupPoint = order.delivery.pickupPoint;

        // Форматируем адрес
        if (order.pickupPoint.address) {
          const addr = order.pickupPoint.address;
          order.pickupPoint.formattedAddress = `${addr.street}, ${addr.city}${
            addr.postalCode ? ` (${addr.postalCode})` : ""
          }`;
        }
      }

      // Обработка вложений
      if (order.attachments && order.attachments.length > 0) {
        order.attachments = order.attachments.map((attachment) => ({
          ...attachment,
          downloadUrl: fileService.getFileUrl(attachment.path),
        }));
      }

      return order;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[OrderService] Ошибка получения заказа ${orderId}:`, error);
      throw ApiError.DatabaseError("Ошибка при получении заказа");
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
        user: userId,
      }).session(session);

      if (!order) {
        throw ApiError.NotFound("Заказ не найден");
      }

      // Проверяем возможность отмены
      if (!this.canCancelOrder(order)) {
        throw ApiError.BadRequest("Заказ нельзя отменить в текущем статусе");
      }

      // Освобождаем зарезервированные товары
      await this.releaseReservedProducts(order.items, session);

      // Обновляем статус заказа
      order.status = OrderStatus.CANCELLED;
      order.cancellation = {
        reason,
        cancelledBy: userId,
        cancelledAt: new Date(),
      };

      order.statusHistory.push({
        status: OrderStatus.CANCELLED,
        changedAt: new Date(),
        changedBy: userId,
        comment: `Отменен пользователем: ${reason}`,
      });

      await order.save({ session });
      await session.commitTransaction();

      // Инвалидируем кеш
      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(userId);

      // Отправляем уведомления
      await sendEmailNotification(
        process.env.SMTP_USER,
        "orderCancelledByUser",
        { orderData: order.toObject() }
      );

      await sendPushNotification({
        userId: userId,
        title: "Заказ отменен",
        body: `Заказ No${order.orderNumber} отменен`,
        data: {
          order: order.toObject(),
        },
      });

      logger.info(
        `[OrderService] Заказ ${orderId} отменен пользователем ${userId}`
      );

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
          { orderNumber: { $regex: filters.search, $options: "i" } },
          { "recipient.fullName": { $regex: filters.search, $options: "i" } },
          { "recipient.email": { $regex: filters.search, $options: "i" } },
          { "recipient.phone": { $regex: filters.search, $options: "i" } },
        ];
      }

      if (filters.userId) {
        query.user = filters.userId;
      }

      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 50;
      const skip = (page - 1) * limit;

      const [orders, total] = await Promise.all([
        OrderModel.find(query)
          .populate("user", "name email")
          .populate("items.product", "title sku category")
          .populate("companyInfo.companyId", "name")
          .populate("statusHistory.changedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        OrderModel.countDocuments(query),
      ]);

      const result = {
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

      // Сохраняем в кеш
      await this.cache.setAdminOrders(cacheKey, result);

      return result;
    } catch (error) {
      logger.error(`[OrderService] Ошибка получения заказов админа:`, error);
      throw ApiError.DatabaseError("Ошибка при получении заказов");
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
        .populate("user", "name email address")
        .populate("items.product")
        .populate("companyInfo.companyId")
        .populate("statusHistory.changedBy", "name email role")
        .populate("cancellation.cancelledBy", "name email")
        .lean();

      if (!order) {
        throw ApiError.NotFound("Заказ не найден");
      }

      // Сохраняем в кеш
      await this.cache.setOrder(order);

      return order;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error(`[OrderService] Ошибка получения заказа ${orderId}:`, error);
      throw ApiError.DatabaseError("Ошибка при получении заказа");
    }
  }

  /**
   * Обновление статуса заказа (админом)
   */
  async updateOrderStatus(orderId, status, userId, comment = "") {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const order = await OrderModel.findById(orderId).session(session);

      if (!order) {
        throw ApiError.NotFound("Заказ не найден");
      }

      // Проверяем валидность перехода статусов
      if (!this.isValidStatusTransition(order.status, status)) {
        throw ApiError.BadRequest(
          `Невозможно сменить статус с ${order.status} на ${status}`
        );
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
        metadata: { previousStatus },
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

      if (
        status === OrderStatus.READY_FOR_PICKUP &&
        order.delivery.method === DeliveryMethod.PICKUP
      ) {
        // Отправляем уведомление о готовности к выдаче
        await this.sendPickupReadyNotification(order);
      }

      await order.save({ session });
      await session.commitTransaction();

      // Инвалидируем кеш
      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(order.user.toString());

      logger.info(
        `[OrderService] Статус заказа ${orderId} изменен: ${previousStatus} -> ${status}`
      );

      return order;
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `[OrderService] Ошибка обновления статуса заказа ${orderId}:`,
        error
      );
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
        throw ApiError.NotFound("Заказ не найден");
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
        notes: `Отменен администратором: ${reason}`,
      };

      order.statusHistory.push({
        status: OrderStatus.CANCELLED,
        changedAt: new Date(),
        changedBy: adminId,
        comment: reason,
      });

      // Если был оплачен - отмечаем возврат
      if (order.payment.status === "paid" && refundAmount) {
        order.payment.status = "refunded";
      }

      await order.save({ session });
      await session.commitTransaction();

      // Инвалидируем кеш
      await this.cache.invalidateOrderCache(orderId);
      await this.cache.invalidateUserCache(order.user.toString());

      // Отправляем уведомления
      await this.sendOrderCancelledNotification(order, reason, refundAmount);

      logger.info(
        `[OrderService] Заказ ${orderId} отменен администратором ${adminId}`
      );

      return order;
    } catch (error) {
      await session.abortTransaction();
      logger.error(
        `[OrderService] Ошибка отмены заказа администратором ${orderId}:`,
        error
      );
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ========== UTILITY METHODS ==========

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
      OrderStatus.AWAITING_INVOICE,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
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

    return transitions[fromStatus]?.includes(toStatus) || false;
  }

  /**
   * Освобождение зарезервированных товаров
   */
  async releaseReservedProducts(items, session) {
    const updates = [];

    for (const item of items) {
      const product = await ProductModel.findById(item.product).session(
        session
      );
      if (product) {
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
    // Получаем ВСЕХ администраторов
    const admins = await UserModel.find({ role: "admin" });
    
    if (admins && admins.length > 0) {
      // Отправляем уведомления каждому администратору
      for (const admin of admins) {
        try {
          // Email уведомление администратору
          await sendEmailNotification(
            admin.email,
            "newOrderAdmin",
            {
              orderNumber: order.orderNumber,
              orderData: order.toObject(),
              customer: user,
            },
            true
          );

          // Push уведомление администратору
          await sendPushNotification({
            userId: admin._id,
            title: "Новый заказ",
            body: `Новый заказ No${order.orderNumber}`,
          });

          
        } catch (error) {
          logger.error(
            `[OrderService] Ошибка отправки уведомления админу ${admin.email}:`,
            error
          );
          // Продолжаем отправку другим админам даже при ошибке
        }
      }
    }

    // Пользователю
    await sendEmailNotification(user.email, "newOrderUser", {
      orderNumber: order.orderNumber,
      orderData: order.toObject(),
      customer: user,
    });

    await sendPushNotification({
      userId: user._id,
      title: "Новый заказ",
      body: `Новый заказ No${order.orderNumber}`,
    });
  } catch (error) {
    logger.error(
      `[OrderService] Ошибка отправки уведомлений для заказа ${order.orderNumber}:`,
      error
    );
    // Не прерываем выполнение при ошибке отправки email
  }
}

  /**
   * Отправка уведомления об отправке
   */
  async sendShippingNotification(order) {
    try {
      const populatedOrder = await OrderModel.findById(order._id).populate(
        "user",
        "email name"
      );

      if (populatedOrder && populatedOrder.user) {
        await sendEmailNotification(populatedOrder.user.email, "orderShipped", {
          orderNumber: order.orderNumber,
          trackingNumber: order.delivery.trackingNumber,
          carrier: order.delivery.carrier,
          estimatedDelivery: order.delivery.estimatedDelivery,
        });
      }
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка отправки уведомления об отправке ${order.orderNumber}:`,
        error
      );
    }
  }

  /**
   * Отправка уведомления о готовности к выдаче
   */
  async sendPickupReadyNotification(order) {
    try {
      const populatedOrder = await OrderModel.findById(order._id).populate(
        "user",
        "email name"
      );

      if (populatedOrder && populatedOrder.user) {
        await sendEmailNotification(
          populatedOrder.user.email,
          "orderReadyForPickup",
          {
            orderNumber: order.orderNumber,
            pickupPoint: order.delivery.pickupPoint,
            orderData: order.toObject(),
          }
        );

        await sendPushNotification({
          userId: order.user._id,
          title: "Ваш заказ готов к выдаче",
          body: "Заказ No" + order.orderNumber + " готов к выдаче",
        });
      }
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка отправки уведомления о готовности ${order.orderNumber}:`,
        error
      );
    }
  }

  async uploadAttachment(orderId, filePath, userId) {
    // Проверяем существование заказа
    const order = await OrderModel.findById(orderId);
    if (!order) {
      throw ApiError.NotFound("Заказ не найден");
    }

    // Проверяем права пользователя (админ)
    // В реальном приложении здесь должна быть проверка роли

    // Обрабатываем файл
    if (!filePath) {
      throw ApiError.BadRequest("Путь к файлу не указан");
    }

    // Извлекаем путь из URL если это полный URL
    let cleanPath = filePath;
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      const url = new URL(filePath);
      cleanPath = url.pathname; // Извлекаем только путь

      // Декодируем URL-encoded символы (например, %20 -> пробел)
      cleanPath = decodeURIComponent(cleanPath);
      console.log(
        `[OrderService] Извлечен и декодирован путь из URL: ${cleanPath}`
      );
    }

    // Проверяем существование файла
    await fileService.validateFileExists(cleanPath);

    // Если файл из временной папки, перемещаем его
    if (cleanPath.includes("/temp/")) {
      const newPath = await this.moveAttachmentFromTemp(
        cleanPath,
        order.orderNumber
      );
      cleanPath = newPath;
    } else {
      // Если уже постоянный путь, просто проверяем существование
      await fileService.validateFileExists(cleanPath);
    }

    // Получаем информацию о файле
    const fileInfo = await fileService.getFileInfo(
      fileService.getAbsolutePath(cleanPath)
    );

    // Создаем объект вложения
    const attachment = {
      name: path.basename(cleanPath),
      path: cleanPath,
      size: fileInfo.size,
      mimeType: fileService.getMimeTypeFromName(cleanPath),
      uploadedAt: new Date(),
      uploadedBy: userId,
    };

    // Добавляем вложение к заказу
    order.attachments.push(attachment);
    await order.save();

    // Инвалидируем кеш заказа
    await this.cache.invalidateOrderCache(orderId);
    await this.cache.invalidateUserCache(order.user.toString());

    // Получаем обновленный заказ
    const updatedOrder = await OrderModel.findById(orderId).populate(
      "attachments.uploadedBy",
      "name email"
    );

    //Отправляем уведоление юзеру
    const userData = await UserModel.findById(order.user);
    if (userData) {
      await sendEmailNotification(userData.email, "newAttachment", {
        orderNumber: order.orderNumber,
        attachment: attachment,
      });
      await sendPushNotification({
        userId: userData._id,
        title: "Новое вложение в заказе",
        body: "Менеджер прикрепил файл к вашему заказу No" + order.orderNumber,
      });
    }
    return updatedOrder.toObject();
  }

  /**
   * Переместить вложение из временной папки в папку заказа
   * @param {string} tempPath - Путь к файлу во временной папке
   * @param {string} orderNumber - Номер заказа
   * @returns {Promise<string>} - Новый путь к файлу
   */
  async moveAttachmentFromTemp(tempPath, orderNumber) {
    console.log(
      `[OrderService] moveAttachmentFromTemp вызван с путем: ${tempPath}`
    );

    // Извлекаем путь из URL если это полный URL
    let cleanPath = tempPath;
    if (tempPath.startsWith("http://") || tempPath.startsWith("https://")) {
      const url = new URL(tempPath);
      cleanPath = url.pathname; // Извлекаем только путь

      // Декодируем URL-encoded символы
      cleanPath = decodeURIComponent(cleanPath);
      console.log(
        `[OrderService] Извлечен и декодирован путь из URL: ${cleanPath}`
      );
    }

    // Проверяем, что путь ведет в temp
    if (!cleanPath.includes("/temp/")) {
      console.log(
        `[OrderService] Путь не из temp, возвращаем как есть: ${cleanPath}`
      );
      return cleanPath; // Если уже не из temp, возвращаем как есть
    }

    // Проверяем существование файла
    await fileService.validateFileExists(cleanPath);

    // Генерируем новый путь
    const filename = path.basename(cleanPath);
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const safeFilename = `${timestamp}_${randomString}_${filename}`;
    const newWebPath = `/uploads/orders/${orderNumber}/${safeFilename}`;

    // Получаем абсолютные пути файловой системы
    const sourceAbsolute = fileService.getAbsolutePath(cleanPath);
    const targetAbsolute = fileService.getAbsolutePath(newWebPath);

    // Создаем папку назначения если нет
    const targetDir = path.dirname(targetAbsolute);
    await fs.mkdir(targetDir, { recursive: true });

    console.log(`[OrderService] Перемещение файла вложения:`);
    console.log(`  Из (абсолютный): ${sourceAbsolute}`);
    console.log(`  В (абсолютный):  ${targetAbsolute}`);
    console.log(`  В (веб-путь):    ${newWebPath}`);

    // Проверяем, что исходный файл существует
    try {
      await fs.access(sourceAbsolute);
      console.log(`[OrderService] Исходный файл существует: ${sourceAbsolute}`);
    } catch (error) {
      console.error(
        `[OrderService] Исходный файл не найден: ${sourceAbsolute}`,
        error
      );
      throw ApiError.BadRequest(`Исходный файл не найден: ${tempPath}`);
    }

    // Перемещаем файл
    try {
      await fs.rename(sourceAbsolute, targetAbsolute);
      console.log(`[OrderService] Файл успешно перемещен`);
    } catch (error) {
      console.error(`[OrderService] Ошибка при перемещении файла:`, error);

      // Альтернатива: копировать и удалить оригинал
      try {
        await fs.copyFile(sourceAbsolute, targetAbsolute);
        await fs.unlink(sourceAbsolute);
        console.log(`[OrderService] Файл скопирован и оригинал удален`);
      } catch (copyError) {
        console.error(
          `[OrderService] Ошибка при копировании файла:`,
          copyError
        );
        throw ApiError.InternalError(
          `Ошибка при перемещении файла: ${copyError.message}`
        );
      }
    }

    return newWebPath;
  }

  /**
   * Удалить вложение из заказа
   * @param {string} orderId - ID заказа
   * @param {string} fileId - ID файла
   * @param {string} userId - ID пользователя (для проверки прав)
   * @returns {Promise<Object>} - Обновленный заказ
   */
  async deleteAttachment(orderId, fileId, userId) {
    console.log(
      `[OrderService] Удаление вложения ${fileId} из заказа ${orderId}`
    );

    // Проверяем существование заказа
    const order = await OrderModel.findById(orderId);
    if (!order) {
      throw ApiError.NotFound("Заказ не найден");
    }

    // Находим вложение
    const attachmentIndex = order.attachments.findIndex(
      (a) => a._id.toString() === fileId
    );
    if (attachmentIndex === -1) {
      throw ApiError.NotFound("Файл не найден в заказе");
    }

    const attachment = order.attachments[attachmentIndex];

    // Удаляем физический файл (если он существует)
    if (attachment.path) {
      try {
        await fileService.deleteFile(attachment.path);
        console.log(
          `[OrderService] Физический файл удален: ${attachment.path}`
        );
      } catch (error) {
        console.warn(
          `[OrderService] Не удалось удалить физический файл: ${error.message}`
        );
        // Не прерываем выполнение если файл уже был удален
      }
    }

    // Удаляем из массива вложений
    order.attachments.splice(attachmentIndex, 1);
    await order.save();

    // Инвалидируем кеш заказа
    await this.cache.invalidateOrderCache(orderId);
    await this.cache.invalidateUserCache(order.user.toString());

    console.log(`[OrderService] Вложение успешно удалено из заказа ${orderId}`);

    return order.toObject();
  }

  /**
   * Отправка уведомления об отмене
   */
  async sendOrderCancelledNotification(order, reason, refundAmount) {
    try {
      const populatedOrder = await OrderModel.findById(order._id).populate(
        "user",
        "email name"
      );

      if (populatedOrder && populatedOrder.user) {
        await sendEmailNotification(
          populatedOrder.user.email,
          "orderCancelledByAdmin",
          {
            orderNumber: order.orderNumber,
            reason,
            refundAmount,
            orderData: order.toObject(),
          }
        );

        await sendPushNotification({
          userId: order.user._id,
          title: "Ваш заказ отменен",
          body: "Заказ No" + order.orderNumber + " отменен",
        });
      }
    } catch (error) {
      logger.error(
        `[OrderService] Ошибка отправки уведомления об отмене ${order.orderNumber}:`,
        error
      );
    }
  }
}

module.exports = new OrderService();
