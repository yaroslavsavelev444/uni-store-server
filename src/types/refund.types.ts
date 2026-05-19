// types/refund.types.ts
import type { HydratedDocument, Model, Types } from "mongoose";

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

// Вложенные структуры
export interface IRefundItem {
  productId: Types.ObjectId;
  reason: RefundReasonType;
  reasonDetails?: string;
  isDefective?: boolean;
  defectDescription?: string;
  pricePerUnit?: number;
  quantity?: number;
}

export interface IRefundMedia {
  url: string;
  type: "image" | "video" | "document";
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

// Базовые поля, сохраняемые в БД
export interface IRefund {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  userEmail: string;
  items: IRefundItem[];
  totalAmount: number;
  refundAmount: number;
  currency: string;
  status: RefundStatusType;
  reason: RefundReasonType;
  description: string;
  media: IRefundMedia[];
  shippingMethod?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  adminNotes: IAdminNote[];
  rejectionReason?: string;
  resolutionNotes?: string;
  refundTransactionId?: string;
  refundedAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  priority: 1 | 2 | 3 | 4 | 5;
  responseTime?: number;
  customerSatisfaction?: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  estimatedCompletionDate?: Date;
  dueDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// Методы экземпляра
export interface IRefundMethods {
  addAdminNote(
    note: string,
    adminId: Types.ObjectId,
    adminName: string,
  ): Promise<RefundDocument>;
  updateStatus(
    newStatus: RefundStatusType,
    adminId: Types.ObjectId,
    notes?: string,
  ): Promise<RefundDocument>;
  assignToAdmin(
    adminId: Types.ObjectId,
    adminName: string,
  ): Promise<RefundDocument>;
}

// Статические методы модели
export interface IRefundModel extends Model<IRefund, {}, IRefundMethods> {
  findByOrder(orderId: Types.ObjectId): Promise<RefundDocument[]>;
  findByUser(userId: Types.ObjectId): Promise<RefundDocument[]>;
  getStats(): Promise<
    Array<{ status: string; count: number; totalAmount: number }>
  >;
}

// Тип документа
export type RefundDocument = HydratedDocument<IRefund, IRefundMethods>;
