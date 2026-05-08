import type { HydratedDocument, Model, Types } from "mongoose";

// === Enum'ы ===
export const RefundStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  APPROVED: "approved",
  REJECTED: "rejected",
  COMPLETED: "completed",
  CLOSED: "closed",
} as const;

export const RefundReason = {
  DEFECTIVE: "defective",
  WRONG_ITEM: "wrong_item",
  DAMAGED: "damaged",
  NOT_AS_DESCRIBED: "not_as_described",
  LATE_DELIVERY: "late_delivery",
  CHANGE_OF_MIND: "change_of_mind",
  OTHER: "other",
} as const;

export type RefundStatusType = (typeof RefundStatus)[keyof typeof RefundStatus];
export type RefundReasonType = (typeof RefundReason)[keyof typeof RefundReason];
export type RefundMethod =
  | "original_payment"
  | "bank_transfer"
  | "credit"
  | "other";
export type MediaType = "image" | "video" | "document";

// === Вложенные поддокументы ===
export interface IRefundItem {
  productId: Types.ObjectId;
  reason: RefundReasonType;
  reasonDetails?: string;
  isDefective?: boolean;
  defectDescription?: string;
  // В pre‑save используются поля pricePerUnit и quantity – добавим опционально
  pricePerUnit?: number;
  quantity?: number;
}

export interface IRefundMedia {
  url: string;
  type?: MediaType;
  originalName?: string;
  size?: number;
  uploadedAt?: Date;
}

export interface IAdminNote {
  note: string;
  adminId: Types.ObjectId;
  adminName: string;
  createdAt?: Date;
}

// === Основной POJO интерфейс ===
export interface IRefund {
  orderId: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  userEmail: string;
  items: IRefundItem[];
  totalAmount: number;
  refundAmount?: number;
  currency: string;
  status: RefundStatusType;
  reason: RefundReasonType;
  description: string;
  media?: IRefundMedia[];
  shippingMethod?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  adminNotes?: IAdminNote[];
  rejectionReason?: string;
  resolutionNotes?: string;
  refundMethod?: RefundMethod;
  refundTransactionId?: string;
  refundedAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  priority?: 1 | 2 | 3 | 4 | 5;
  responseTime?: number; // hours
  customerSatisfaction?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  estimatedCompletionDate?: Date;
  dueDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Виртуальные поля ===
export interface IRefundVirtuals {
  isOverdue: boolean;
  daysOpen: number;
  formattedStatus: string;
  formattedReason: string;
}

// === Методы экземпляра ===
export interface IRefundMethods {
  addAdminNote(
    note: string,
    adminId: Types.ObjectId,
    adminName: string,
  ): Promise<HydratedRefund>;
  updateStatus(
    newStatus: RefundStatusType,
    adminId: Types.ObjectId,
    notes?: string,
  ): Promise<HydratedRefund>;
  assignToAdmin(
    adminId: Types.ObjectId,
    adminName: string,
  ): Promise<HydratedRefund>;
}

// === Статические методы ===
export interface RefundModelType extends Model<IRefund, {}, IRefundMethods> {
  findByOrder(orderId: Types.ObjectId): Promise<HydratedRefund[]>;
  findByUser(userId: Types.ObjectId): Promise<HydratedRefund[]>;
  getStats(): Promise<
    Array<{ status: string; count: number; totalAmount: number }>
  >;
}

// === Тип документа ===
export type HydratedRefund = HydratedDocument<IRefund, IRefundMethods> &
  IRefundVirtuals;
