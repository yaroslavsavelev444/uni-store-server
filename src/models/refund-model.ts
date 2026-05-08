import { model, Schema, Types } from "mongoose";
import {
  type HydratedRefund,
  type IRefund,
  type IRefundMethods,
  type RefundModelType,
  RefundReason,
  RefundStatus,
} from "../types/refund.types.js";

const refundStatusValues = Object.values(RefundStatus);
const refundReasonValues = Object.values(RefundReason);

const RefundSchema = new Schema<IRefund, RefundModelType, IRefundMethods>(
  {
    orderId: {
      type: Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderNumber: { type: String, required: true, trim: true, index: true },
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Некорректный email"],
    },
    items: [
      {
        productId: { type: Types.ObjectId, ref: "Product", required: true },
        reason: { type: String, enum: refundReasonValues, required: true },
        reasonDetails: { type: String, maxlength: 500 },
        isDefective: { type: Boolean, default: false },
        defectDescription: { type: String, maxlength: 500 },
        // Поля для pre‑save (опционально)
        pricePerUnit: Number,
        quantity: Number,
      },
    ],
    totalAmount: { type: Number, required: true, min: 0, max: 1_000_000 },
    refundAmount: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: "RUB", uppercase: true },
    status: {
      type: String,
      enum: refundStatusValues,
      default: RefundStatus.PENDING,
    },
    reason: {
      type: String,
      enum: refundReasonValues,
      required: true,
    },
    description: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 2000,
    },
    media: [
      {
        url: {
          type: String,
          required: true,
          validate: {
            validator: (v: string) => /^(https?:\/\/|\/uploads\/)/.test(v),
            message: "Некорректный формат ссылки на файл",
          },
        },
        type: {
          type: String,
          enum: ["image", "video", "document"],
          default: "image",
        },
        originalName: { type: String, maxlength: 255 },
        size: { type: Number, min: 0, max: 50 * 1024 * 1024 },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    shippingMethod: { type: String, trim: true },
    trackingNumber: { type: String, trim: true },
    estimatedDeliveryDate: Date,
    adminNotes: [
      {
        note: { type: String, required: true, maxlength: 1000 },
        adminId: { type: Types.ObjectId, ref: "User", required: true },
        adminName: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    rejectionReason: { type: String, maxlength: 500 },
    resolutionNotes: { type: String, maxlength: 1000 },
    refundMethod: {
      type: String,
      enum: ["original_payment", "bank_transfer", "credit", "other"],
      default: "original_payment",
    },
    refundTransactionId: { type: String, trim: true },
    refundedAt: Date,
    createdBy: { type: Types.ObjectId, ref: "User" },
    updatedBy: { type: Types.ObjectId, ref: "User" },
    assignedTo: { type: Types.ObjectId, ref: "User" },
    priority: { type: Number, enum: [1, 2, 3, 4, 5], default: 3 },
    responseTime: { type: Number, min: 0 },
    customerSatisfaction: { type: Number, min: 1, max: 5 },
    tags: [{ type: String, trim: true, lowercase: true }],
    estimatedCompletionDate: Date,
    dueDate: Date,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.updatedAt;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// === Виртуальные поля ===
RefundSchema.virtual("isOverdue").get(function (this: IRefund) {
  if (!this.dueDate) return false;
  return (
    new Date() > this.dueDate && ["pending", "processing"].includes(this.status)
  );
});

RefundSchema.virtual("daysOpen").get(function (this: IRefund) {
  const createdAt = this.createdAt || new Date();
  return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

RefundSchema.virtual("formattedStatus").get(function (this: IRefund) {
  const statusMap: Record<string, string> = {
    [RefundStatus.PENDING]: "Ожидает рассмотрения",
    [RefundStatus.PROCESSING]: "В обработке",
    [RefundStatus.APPROVED]: "Одобрено",
    [RefundStatus.REJECTED]: "Отклонено",
    [RefundStatus.COMPLETED]: "Завершено",
    [RefundStatus.CLOSED]: "Закрыто",
  };
  return statusMap[this.status] || this.status;
});

RefundSchema.virtual("formattedReason").get(function (this: IRefund) {
  const reasonMap: Record<string, string> = {
    [RefundReason.DEFECTIVE]: "Бракованный товар",
    [RefundReason.WRONG_ITEM]: "Не тот товар",
    [RefundReason.DAMAGED]: "Поврежден при доставке",
    [RefundReason.NOT_AS_DESCRIBED]: "Не соответствует описанию",
    [RefundReason.LATE_DELIVERY]: "Опоздание доставки",
    [RefundReason.CHANGE_OF_MIND]: "Передумал",
    [RefundReason.OTHER]: "Другое",
  };
  return reasonMap[this.reason] || this.reason;
});

// === Индексы ===
RefundSchema.index({ orderId: 1, status: 1 });
RefundSchema.index({ userId: 1, createdAt: -1 });
RefundSchema.index({ status: 1, priority: 1, createdAt: 1 });
RefundSchema.index({ orderNumber: "text", userEmail: "text" });
RefundSchema.index({ createdAt: -1 });
RefundSchema.index({ dueDate: 1, status: 1 });
RefundSchema.index({ assignedTo: 1, status: 1 });

// === Pre‑save hook ===
RefundSchema.pre("save", function (this: IRefund, next) {
  if (!this.dueDate && ["pending", "processing"].includes(this.status)) {
    const dueDate = new Date(this.createdAt || Date.now());
    dueDate.setDate(dueDate.getDate() + 14);
    this.dueDate = dueDate;
  }

  // Пересчёт totalAmount, если в items есть pricePerUnit и quantity
  if (this.isModified("items") && this.items.length > 0) {
    let total = 0;
    for (const item of this.items) {
      const price = (item as any).pricePerUnit || 0;
      const qty = (item as any).quantity || 0;
      total += price * qty;
    }
    if (total > 0) this.totalAmount = total;
  }

  next();
});

// === Статические методы ===
RefundSchema.statics.findByOrder = function (
  this: RefundModelType,
  orderId: Types.ObjectId,
) {
  return this.find({ orderId }).sort({ createdAt: -1 });
};

RefundSchema.statics.findByUser = function (
  this: RefundModelType,
  userId: Types.ObjectId,
) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

RefundSchema.statics.getStats = async function (this: RefundModelType) {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
      },
    },
    {
      $project: {
        status: "$_id",
        count: 1,
        totalAmount: 1,
        _id: 0,
      },
    },
  ]);
  return stats;
};

// === Методы экземпляра ===
RefundSchema.methods.addAdminNote = async function (
  this: HydratedRefund,
  note: string,
  adminId: Types.ObjectId,
  adminName: string,
) {
  this.adminNotes = this.adminNotes || [];
  this.adminNotes.push({ note, adminId, adminName, createdAt: new Date() });
  return this.save();
};

RefundSchema.methods.updateStatus = async function (
  this: HydratedRefund,
  newStatus: (typeof RefundStatus)[keyof typeof RefundStatus],
  adminId: Types.ObjectId,
  notes = "",
) {
  const oldStatus = this.status;
  this.status = newStatus;
  this.updatedBy = adminId;
  if (notes) {
    await this.addAdminNote(
      `Статус изменен с "${oldStatus}" на "${newStatus}". ${notes}`,
      adminId,
      "Система",
    );
  }
  if (["completed", "closed", "rejected"].includes(newStatus)) {
    this.refundedAt = new Date();
  }
  return this.save();
};

RefundSchema.methods.assignToAdmin = async function (
  this: HydratedRefund,
  adminId: Types.ObjectId,
  adminName: string,
) {
  this.assignedTo = adminId;
  await this.addAdminNote(
    `Заявка назначена администратору: ${adminName}`,
    adminId,
    "Система",
  );
  return this.save();
};

export default model<IRefund, RefundModelType>("Refund", RefundSchema);
export { RefundReason, RefundStatus };
