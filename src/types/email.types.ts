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
  orderNumber: string;
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

export interface NewFeedbackData {
  feedbackId: string;
  title: string;
  type: string;
  userName: string;
  userEmail: string;
  priority: string;
  createdAt: Date | string;
  description: string;
}

export interface FeedbackStatusChangedData {
  feedbackId: string;
  title: string;
  oldStatus: string;
  newStatus: string;
  userName: string;
  updatedAt: Date | string;
}

export interface FeedbackAssignedData {
  feedbackId: string;
  title: string;
  type: string;
  priority: string;
  description: string;
  createdAt: Date | string;
  userName: string;
  assignedBy: string;
}

export type OrderCancelledByUserData = {
  order: EmailOrderData;
};

export interface ResetPasswordCompletedData {
  email: string;
  name: string;
}
