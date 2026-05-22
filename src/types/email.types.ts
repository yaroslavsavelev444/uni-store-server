// ========== Типы ==========
export type EmailType =
  | "resetPassword"
  | "newOrderUser"
  | "newOrderAdmin"
  | "twofaCode"
  | "orderCancelledByAdmin"
  | "newProductReview"
  | "orderShipped"
  | "orderReadyForPickup"
  | "newAttachment"
  | "newLogin"
  | "consentUpdated"
  | "newFeedback"
  | "feedbackStatusChanged"
  | "feedbackAssigned"
  | "orderCancelledByUser"
  | "resetPasswordCompleted";

// Интерфейсы данных для каждого типа письма
export interface ResetPasswordData {
  username: string;
  resetLink: string;
}

export interface NewOrderUserData {
  orderNumber: string;
  order: EmailOrderData;
  customer: {
    id?: string;
    email?: string;
    name?: string;
  };
}
export interface NewOrderAdminData {
  orderNumber: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  orderData?: {
    pricing?: {
      total: number;
      currency: string;
    };
  };
}

export interface TwofaCodeData {
  code: string;
  expiresInMinutes: number;
}

export interface OrderCancelledByAdminData {
  order: EmailOrderData; // полная структура заказа
  reason: string;
  refundAmount?: number;
  cancelledAt: Date; // дата отмены
}

export interface NewProductReviewData {
  productTitle: string;
  userName: string;
  rating: number;
  comment: string;
  pros?: string[];
  cons?: string[];
  reviewId: string;
}

// src/types/email.types.ts
export interface EmailOrderData {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  items: Array<{
    name: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  pricing: {
    subtotal: number;
    discount: number;
    total: number;
    currency: string;
  };
  recipient: {
    fullName: string;
    phone: string;
    email: string;
  };
  delivery: {
    method: string;
    address?: any;
    notes?: string;
  };
  cancellation?: {
    // опциональное поле
    reason?: string;
    cancelledBy?: string;
    cancelledAt?: Date;
    cancelledByRole?: "user" | "admin" | "system";
  };
}

export interface OrderShippedData {
  orderNumber: string;
  order: EmailOrderData;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string; // или Date
}

export interface OrderReadyForPickupData {
  order: EmailOrderData;
  pickupPoint: {
    name: string;
    address: string;
    hours: string;
  };
}

export interface NewAttachmentData {
  orderNumber: string;
  attachment: {
    name: string;
    size: number;
    mimeType: string;
    uploadedAt: Date | string;
  };
}

export interface NewLoginData {
  ip: string;
  deviceType: string;
  deviceModel: string;
  os: string;
  osVersion: string;
  date: Date | string;
}

export interface ConsentUpdatedData {
  consentTitle: string;
  version: string;
  updateDate: string;
  changeDescription: string;
  documentUrl?: string;
  effectiveDate: string;
}
export interface NewFeedbackEmailData {
  feedbackId: string;
  title: string;
  type: string;
  userName: string;
  userEmail: string;
  priority: string;
  createdAtFormatted: string;
  createdAtRaw: string;
  description: string;
  hasAttachments: boolean;
}

export interface FeedbackStatusChangedData {
  feedbackId: string;
  feedbackUrl: string; // ссылка для перехода к фидбеку (клиентская или админская)
  title: string;
  oldStatus: string; // человекочитаемый старый статус
  newStatus: string; // человекочитаемый новый статус
  oldStatusCode: string; // оригинальный код статуса (new, in_progress...)
  newStatusCode: string;
  comment?: string; // комментарий администратора (если есть)
  userName: string; // имя пользователя (для обращения в письме)
  updatedAtFormatted: string; // уже отформатированная дата и время
  updatedAtRaw?: string; // ISO-строка (опционально)
}

export interface FeedbackAssignedData {
  feedbackId: string;
  feedbackUrl: string; // ссылка на фидбек в админке
  title: string;
  type: string; // "bug" | "improvement" | ...
  priority: string; // "low" | "medium" | ...
  description: string; // описание (уже обрезано, но можно полное)
  createdAtFormatted: string; // отформатированная дата создания
  createdAtRaw?: string; // ISO-строка (опционально)
  assignedToName: string; // имя назначенного сотрудника (админа)
  assignedByName: string; // имя администратора, который назначил
  assignedByEmail?: string;
}

export type OrderCancelledByUserData = {
  order: EmailOrderData;
};

export interface ResetPasswordCompletedData {
  email: string;
  name: string;
}
