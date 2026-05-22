import { model, Schema, type Types } from "mongoose";
import {
  type IRefund,
  type IRefundItem,
  type IRefundMethods,
  type IRefundModel,
  type RefundDocument,
  RefundReason,
  RefundStatus,
  type RefundStatusType,
} from "../types/refund.types.js";

const refundStatusValues = Object.values(RefundStatus);
const refundReasonValues = Object.values(RefundReason);

const RefundSchema = new Schema<IRefund, IRefundModel, IRefundMethods>(
  {
    orderId: {
      type: Schema.Types.ObjectId, // ✅ исправлено
      ref: "Order",
      required: true,
      index: true,
    },
    orderNumber: { type: String, required: true, trim: true, index: true },
    userId: {
      type: Schema.Types.ObjectId, // ✅ исправлено
      ref: "User",
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Некорректный email"],
    },
    items: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        }, // ✅
        reason: { type: String, enum: refundReasonValues, required: true },
        reasonDetails: { type: String, maxlength: 500 },
        isDefective: { type: Boolean, default: false },
        defectDescription: { type: String, maxlength: 500 },
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
        adminId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // ✅
        adminName: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    rejectionReason: { type: String, maxlength: 500 },
    resolutionNotes: { type: String, maxlength: 1000 },
    refundTransactionId: { type: String, trim: true },
    refundedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" }, // ✅
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" }, // ✅
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" }, // ✅
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
        delete (ret as any).__v;
        // ✅ безопасное удаление опционального поля
        delete (ret as Record<string, unknown>).updatedAt;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// === Виртуальные поля ===
RefundSchema.virtual("isOverdue").get(function (this: RefundDocument) {
  if (!this.dueDate) return false;
  return (
    new Date() > this.dueDate && ["pending", "processing"].includes(this.status)
  );
});

RefundSchema.virtual("daysOpen").get(function (this: RefundDocument) {
  const createdAt = this.createdAt || new Date();
  return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

RefundSchema.virtual("formattedStatus").get(function (this: RefundDocument) {
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

RefundSchema.virtual("formattedReason").get(function (this: RefundDocument) {
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
RefundSchema.pre("save", function (this: RefundDocument, next) {
  // Устанавливаем dueDate, если его нет и статус активный
  if (!this.dueDate && ["pending", "processing"].includes(this.status)) {
    const dueDate = new Date(this.createdAt || Date.now());
    dueDate.setDate(dueDate.getDate() + 14);
    this.dueDate = dueDate;
  }

  // Вычисляем totalAmount, если изменились items
  if (this.isModified("items") && this.items.length > 0) {
    let total = 0;
    for (const item of this.items) {
      const typedItem = item as IRefundItem; // ✅ тип вместо any
      const price = typedItem.pricePerUnit || 0;
      const qty = typedItem.quantity || 0;
      total += price * qty;
    }
    if (total > 0) this.totalAmount = total;
  }

  next();
});

// === Статические методы ===
RefundSchema.statics.findByOrder = function (
  this: IRefundModel,
  orderId: Types.ObjectId,
) {
  return this.find({ orderId }).sort({ createdAt: -1 });
};

RefundSchema.statics.findByUser = function (
  this: IRefundModel,
  userId: Types.ObjectId,
) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

RefundSchema.statics.getStats = async function (this: IRefundModel) {
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
  this: RefundDocument,
  note: string,
  adminId: Types.ObjectId,
  adminName: string,
): Promise<RefundDocument> {
  this.adminNotes = this.adminNotes || [];
  this.adminNotes.push({ note, adminId, adminName, createdAt: new Date() });
  const saved = await this.save();
  return saved as RefundDocument; // ✅ явное приведение
};

RefundSchema.methods.updateStatus = async function (
  this: RefundDocument,
  newStatus: RefundStatusType,
  adminId: Types.ObjectId,
  notes = "",
): Promise<RefundDocument> {
  const oldStatus = this.status;
  this.status = newStatus;
  this.updatedBy = adminId;
  if (notes) {
    await this.addAdminNote(
      // ✅ добавлен await
      `Статус изменен с "${oldStatus}" на "${newStatus}". ${notes}`,
      adminId,
      "Система",
    );
  }
  if (["completed", "closed", "rejected"].includes(newStatus)) {
    this.refundedAt = new Date();
  }
  const saved = await this.save();
  return saved as RefundDocument;
};

RefundSchema.methods.assignToAdmin = async function (
  this: RefundDocument,
  adminId: Types.ObjectId,
  adminName: string,
): Promise<RefundDocument> {
  this.assignedTo = adminId;
  await this.addAdminNote(
    `Заявка назначена администратору: ${adminName}`,
    adminId,
    "Система",
  );
  const saved = await this.save();
  return saved as RefundDocument;
};

export const RefundModel = model<IRefund, IRefundModel>("Refund", RefundSchema);
export default RefundModel;
export { RefundReason, RefundStatus };
