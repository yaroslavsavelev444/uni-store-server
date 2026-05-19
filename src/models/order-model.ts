import { model, Schema, Types } from "mongoose";
import {
  DeliveryMethod,
  type IOrder,
  type IOrderMethods,
  type IOrderModel,
  type OrderDocument,
  OrderStatus,
  PaymentMethod,
} from "../types/order.types.js";

// Переиспользуем enum-объекты для проверок в схеме
const orderStatusValues = Object.values(OrderStatus);
const deliveryMethodValues = Object.values(DeliveryMethod);
const paymentMethodValues = Object.values(PaymentMethod);

const OrderSchema = new Schema<IOrder, IOrderModel, IOrderMethods>(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    delivery: {
      method: {
        type: String,
        enum: deliveryMethodValues,
        required: true,
        default: DeliveryMethod.DOOR_TO_DOOR,
      },
      address: {
        street: String,
        city: String,
        postalCode: String,
        country: String,
      },
      pickupPoint: { type: Schema.Types.ObjectId, ref: "PickupPoint" },
      transportCompany: {
        type: Schema.Types.ObjectId,
        ref: "TransportCompany",
      },
      trackingNumber: String,
      estimatedDelivery: Date,
      notes: String,
    },

    recipient: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      contactPerson: String,
    },

    companyInfo: {
      companyId: { type: Schema.Types.ObjectId, ref: "Company" },
      name: String,
      address: String,
      legalAddress: String,
      taxNumber: String,
      contactPerson: String,
    },

    items: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        sku: String,
        name: String,
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        totalPrice: { type: Number, required: true, min: 0 },
        weight: Number,
        dimensions: { length: Number, width: Number, height: Number },
      },
    ],

    pricing: {
      subtotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      shippingCost: { type: Number, default: 0, min: 0 },
      tax: { type: Number, default: 0, min: 0 },
      total: { type: Number, required: true, min: 0 },
      currency: { type: String, default: "RUB" },
      productDiscounts: { type: Number, default: 0, min: 0 },
      centralDiscountAmount: { type: Number, default: 0, min: 0 },
      priceWithoutDiscount: { type: Number, default: 0, min: 0 },
      centralDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    },

    payment: {
      method: { type: String, enum: paymentMethodValues, required: true },
      status: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending",
      },
      transactionId: String,
      paidAt: Date,
      paymentDetails: { type: Schema.Types.Mixed },
    },

    status: {
      type: String,
      enum: orderStatusValues,
      required: true,
      default: OrderStatus.PENDING,
      index: true,
    },

    statusHistory: [
      {
        status: { type: String, enum: orderStatusValues, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        comment: String,
        metadata: { type: Schema.Types.Mixed },
      },
    ],

    appliedDiscounts: [
      {
        discountId: { type: Schema.Types.ObjectId, ref: "Discount" },
        name: String,
        type: {
          type: String,
          enum: ["quantity_based", "amount_based", "percentage_based"],
        },
        discountPercent: Number,
        discountAmount: Number,
        condition: { type: Schema.Types.Mixed },
        appliedAt: { type: Date, default: Date.now },
      },
    ],

    cancellation: {
      reason: String,
      cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
      cancelledAt: Date,
      refundAmount: Number,
      notes: String,
    },

    attachments: [
      {
        name: String,
        path: String,
        size: Number,
        mimeType: String,
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],

    notes: String,
    internalNotes: String,
    tags: [String],

    companyCreated: Boolean,
    companySelection: {
      type: { type: String, enum: ["existing", "new"] },
      companyId: String,
      taxNumber: String,
    },

    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ["web", "mobile", "api", "admin"],
      default: "web",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Pre-save: генерация номера заказа
OrderSchema.pre("save", async function (this: OrderDocument, next) {
  if (this.isNew) {
    const year = new Date().getFullYear();
    const Model = this.constructor as IOrderModel;
    const count = await Model.countDocuments({
      createdAt: { $gte: new Date(`${year}-01-01`) },
    });
    this.orderNumber = `ORD-${year}-${(count + 1).toString().padStart(6, "0")}`;
  }
  next();
});

// Виртуальные поля – не дублируются в IOrder
OrderSchema.virtual("company", {
  ref: "Company",
  localField: "companyInfo.companyId",
  foreignField: "_id",
  justOne: true,
});

OrderSchema.virtual("pickupPointData", {
  ref: "PickupPoint",
  localField: "delivery.pickupPoint",
  foreignField: "_id",
  justOne: true,
});

OrderSchema.virtual("transportCompanyData", {
  ref: "TransportCompany",
  localField: "delivery.transportCompany",
  foreignField: "_id",
  justOne: true,
});

// Индексы
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ "payment.status": 1 });
OrderSchema.index({ "delivery.method": 1 });
OrderSchema.index({ "payment.method": 1 });

// Экспорт модели
const OrderModel = model<IOrder, IOrderModel>("Order", OrderSchema);

// Сохраняем именованные экспорты для enum и модели
export { DeliveryMethod, OrderModel, OrderStatus, PaymentMethod };
export default OrderModel;
