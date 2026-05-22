// types/refund-service.types.ts
import type { Types } from "mongoose";
import type {
  RefundReason,
  RefundReasonType,
  RefundStatusType,
} from "./refund.types.js";

/**
 * Входные данные для создания заявки
 */
export interface CreateRefundInput {
  orderId: string;
  orderNumber: string;
  userEmail: string;
  items: RefundItemInput[];
  totalAmount: number;
  reason: RefundReasonType;
  description: string;
  media?: MediaInput[];
  shippingMethod?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  priority?: 1 | 2 | 3 | 4 | 5;
  dueDate?: Date;
}

export interface RefundItemInput {
  productId: string;
  reason: RefundReasonType;
  reasonDetails?: string;
  isDefective?: boolean;
  defectDescription?: string;
  pricePerUnit?: number;
  quantity?: number;
}

export interface MediaInput {
  url: string;
  type?: "image" | "video" | "document";
  originalName?: string;
  size?: number;
}

/**
 * Параметры запроса для получения заявок пользователя
 */
export interface GetRefundsQuery {
  status?: RefundStatusType | RefundStatusType[];
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Параметры запроса для администратора
 */
export interface AdminGetRefundsQuery extends GetRefundsQuery {
  priority?: number;
  assignedTo?: string;
  orderNumber?: string;
  userEmail?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Данные для обновления статуса
 */
export interface UpdateRefundStatusInput {
  status: RefundStatusType;
  notes?: string;
  reason?: string; // причина отклонения/закрытия
  refundAmount?: number;
  resolutionNotes?: string;
}

/**
 * Данные для добавления заметки
 */
export interface AddAdminNoteInput {
  note: string;
}

/**
 * Данные для назначения администратора
 */
export interface AssignToAdminInput {
  adminId: string;
  adminName: string;
}

/**
 * Формат ответа с заявкой
 */
export interface RefundResponse {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  items: RefundItemResponse[];
  totalAmount: number;
  refundAmount?: number;
  currency: string;
  status: RefundStatusType;
  reason: RefundReasonType;
  description: string;
  media?: MediaResponse[];
  shippingMethod?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  adminNotes?: AdminNoteResponse[];
  rejectionReason?: string;
  resolutionNotes?: string;
  refundTransactionId?: string;
  refundedAt?: Date;
  createdBy: string;
  updatedBy: string;
  assignedTo?: string;
  priority: number;
  responseTime?: number;
  customerSatisfaction?: number;
  tags?: string[];
  estimatedCompletionDate?: Date;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  // виртуальные поля
  formattedStatus: string;
  formattedReason: string;
  isOverdue: boolean;
  daysOpen: number;
}

export interface RefundItemResponse {
  productId: {
    _id: string;
    title: string;
    sku?: string;
    mainImage?: string;
  };
  reason: RefundReasonType;
  reasonDetails?: string;
  isDefective?: boolean;
  defectDescription?: string;
  pricePerUnit: number;
  quantity: number;
}

export interface MediaResponse {
  url: string;
  type: string;
  originalName?: string;
  size?: number;
  uploadedAt: Date;
}

export interface AdminNoteResponse {
  note: string;
  adminId: string;
  adminName: string;
  createdAt: Date;
}

/**
 * Пагинированный ответ
 */
export interface PaginatedRefundsResponse {
  refunds: RefundResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Статистика по возвратам
 */
export interface RefundStatsResponse {
  timeframe: string;
  total: number;
  totalAmount: number;
  byStatus: Array<{ _id: string; count: number; totalAmount: number }>;
  byReason: Array<{ _id: string; count: number }>;
  daily: Array<{ _id: string; count: number; amount: number }>;
  byPriority: Array<{
    _id: number;
    count: number;
    avgProcessingTime: number | null;
  }>;
  overdueCount: number;
}
