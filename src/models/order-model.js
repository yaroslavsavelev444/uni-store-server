const { Schema, model } = require("mongoose");

const OrderStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PROCESSING: "processing",
  PACKED: "packed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  READY_FOR_PICKUP: "ready_for_pickup",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  AWAITING_INVOICE: "awaiting_invoice"
};

const DeliveryMethod = {
  DOOR_TO_DOOR: "door_to_door",
  PICKUP_POINT: "pickup_point",
  SELF_PICKUP: "self_pickup"
};

const PaymentMethod = {
  INVOICE: "invoice",
  COURIER_CASH: "courier_cash",
  PICKUP_POINT_CASH: "pickup_point_cash",
  SELF_PICKUP_CARD: "self_pickup_card",
  SELF_PICKUP_CASH: "self_pickup_cash"
};

const OrderSchema = new Schema(
  {
    // Основная информация
    orderNumber: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    user: { 
      type: Schema.Types.ObjectId, 
      ref: "User",
      required: true,
      index: true
    },
    
    // Информация о доставке (ОБНОВЛЕНО)
    delivery: {
      method: {
        type: String,
        enum: Object.values(DeliveryMethod),
        required: true,
        default: DeliveryMethod.DOOR_TO_DOOR
      },
      address: {
        street: String,
        city: String,
        postalCode: String,
        country: String
      },
      pickupPoint: {
        type: Schema.Types.ObjectId,
        ref: "PickupPoint"
      },
      transportCompany: {
        type: Schema.Types.ObjectId,
        ref: "TransportCompany"
      },
      trackingNumber: String,
      estimatedDelivery: Date,
      notes: String
    },
    
    // Информация о получателе (ОБНОВЛЕНО)
    recipient: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      contactPerson: String
    },
    
    // Информация о компании (если заказ от компании)
    companyInfo: {
      companyId: { type: Schema.Types.ObjectId, ref: "Company" },
      name: String,
      address: String,
      legalAddress: String,
      taxNumber: String,
      contactPerson: String
    },
    
    // Товары в заказе
    items: [{
      product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true
      },
      sku: String,
      name: String,
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      unitPrice: {
        type: Number,
        required: true,
        min: 0
      },
      discount: {
        type: Number,
        default: 0,
        min: 0
      },
      totalPrice: {
        type: Number,
        required: true,
        min: 0
      },
      weight: Number,
      dimensions: {
        length: Number,
        width: Number,
        height: Number
      }
    }],
    
    // Финансовая информация
    pricing: {
      subtotal: {
        type: Number,
        required: true,
        min: 0
      },
      discount: {
        type: Number,
        default: 0,
        min: 0
      },
      shippingCost: {
        type: Number,
        default: 0,
        min: 0
      },
      tax: {
        type: Number,
        default: 0,
        min: 0
      },
      total: {
        type: Number,
        required: true,
        min: 0
      },
      currency: {
        type: String,
        default: "RUB"
      }
    },
    
    // Платежная информация (ОБНОВЛЕНО)
    payment: {
      method: {
        type: String,
        enum: Object.values(PaymentMethod),
        required: true
      },
      status: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending"
      },
      transactionId: String,
      paidAt: Date,
      paymentDetails: Schema.Types.Mixed
    },
    
    // Статус заказа
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      required: true,
      default: OrderStatus.PENDING,
      index: true
    },
    
    // История статусов
    statusHistory: [{
      status: {
        type: String,
        enum: Object.values(OrderStatus),
        required: true
      },
      changedAt: {
        type: Date,
        default: Date.now
      },
      changedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      comment: String,
      metadata: Schema.Types.Mixed
    }],
    
    // Информация об отмене
    cancellation: {
      reason: String,
      cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
      cancelledAt: Date,
      refundAmount: Number,
      notes: String
    },
    
    // Прикрепленные файлы
    attachments: [{
      name: String,
      path: String,
      size: Number,
      mimeType: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      },
      uploadedBy: { type: Schema.Types.ObjectId, ref: "User" }
    }],
    
    // Дополнительные поля (ОБНОВЛЕНО)
    notes: String,
    internalNotes: String,
    tags: [String],
    
    // Флаги для логики создания компании
    companyCreated: Boolean,
    companySelection: {
      type: { type: String, enum: ["existing", "new"] },
      companyId: String,
      taxNumber: String
    },
    
    // Системные поля
    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ["web", "mobile", "api", "admin"],
      default: "web"
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Генерация номера заказа
OrderSchema.pre("save", async function(next) {
  if (this.isNew) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({
      createdAt: { $gte: new Date(`${year}-01-01`) }
    });
    this.orderNumber = `ORD-${year}-${(count + 1).toString().padStart(6, '0')}`;
  }
  next();
});

// Виртуальные поля для удобства
OrderSchema.virtual("company", {
  ref: "Company",
  localField: "companyInfo.companyId",
  foreignField: "_id",
  justOne: true
});

OrderSchema.virtual("pickupPointData", {
  ref: "PickupPoint",
  localField: "delivery.pickupPoint",
  foreignField: "_id",
  justOne: true
});

OrderSchema.virtual("transportCompanyData", {
  ref: "TransportCompany",
  localField: "delivery.transportCompany",
  foreignField: "_id",
  justOne: true
});

// Индексы для быстрого поиска
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ "payment.status": 1 });
OrderSchema.index({ "delivery.method": 1 });
OrderSchema.index({ "payment.method": 1 });

const OrderModel = model("Order", OrderSchema);

module.exports = {
  OrderModel,
  OrderStatus,
  DeliveryMethod,
  PaymentMethod
};