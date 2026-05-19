import type { HydratedDocument, Model, Types } from "mongoose";

// === Enum‑объекты (as const) ===
export const OrderStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PROCESSING: "processing",
  PACKED: "packed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  READY_FOR_PICKUP: "ready_for_pickup",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  AWAITING_INVOICE: "awaiting_invoice",
} as const;

export const DeliveryMethod = {
  DOOR_TO_DOOR: "door_to_door",
  PICKUP_POINT: "pickup_point",
  SELF_PICKUP: "self_pickup",
} as const;

export const PaymentMethod = {
  INVOICE: "invoice",
  COURIER_CASH: "courier_cash",
  PICKUP_POINT_CASH: "pickup_point_cash",
  SELF_PICKUP_CARD: "self_pickup_card",
  SELF_PICKUP_CASH: "self_pickup_cash",
} as const;

// Типы значений enum
export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];
export type DeliveryMethodType =
  (typeof DeliveryMethod)[keyof typeof DeliveryMethod];
export type PaymentMethodType =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];
export type PaymentStatusType = "pending" | "paid" | "failed" | "refunded";
export type OrderSourceType = "web" | "mobile" | "api" | "admin";

// === Вложенные поддокументы ===

export interface IDeliveryAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface IDelivery {
  method: DeliveryMethodType;
  address?: IDeliveryAddress;
  pickupPoint?: Types.ObjectId;
  transportCompany?: Types.ObjectId;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  notes?: string;
}

export interface IRecipient {
  fullName: string;
  phone: string;
  email: string;
  contactPerson?: string;
}

export interface ICompanyInfo {
  companyId?: Types.ObjectId;
  name?: string;
  address?: string;
  legalAddress?: string;
  taxNumber?: string;
  contactPerson?: string;
}

export interface IOrderItem {
  product: Types.ObjectId;
  sku?: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  weight?: number;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
}

export interface IPricing {
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  total: number;
  currency: string;
  productDiscounts: number;
  centralDiscountAmount: number;
  priceWithoutDiscount: number;
  centralDiscountPercent: number;
}

export interface IPayment {
  method: PaymentMethodType;
  status: PaymentStatusType;
  transactionId?: string;
  paidAt?: Date;
  paymentDetails?: any;
}

export interface IStatusHistoryEntry {
  status: OrderStatusType;
  changedAt: Date;
  changedBy: Types.ObjectId;
  comment?: string;
  metadata?: any;
}

export interface IAppliedDiscount {
  discountId?: Types.ObjectId;
  name?: string;
  type?: "quantity_based" | "amount_based" | "percentage_based";
  discountPercent?: number;
  discountAmount?: number;
  condition?: any;
  appliedAt?: Date;
}

export interface ICancellation {
  reason?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  refundAmount?: number;
  notes?: string;
}

export interface IAttachment {
  name?: string;
  path?: string;
  size?: number;
  mimeType?: string;
  uploadedAt?: Date;
  uploadedBy?: Types.ObjectId;
}

export interface ICompanySelection {
  type?: "existing" | "new";
  companyId?: string;
  taxNumber?: string;
}

// === Базовые поля, сохраняемые в БД (без виртуалов) ===
export interface IOrder {
  _id: Types.ObjectId;
  orderNumber: string;
  user: Types.ObjectId;
  delivery: IDelivery;
  recipient: IRecipient;
  companyInfo?: ICompanyInfo;
  items: IOrderItem[];
  pricing: IPricing;
  payment: IPayment;
  status: OrderStatusType;
  statusHistory: IStatusHistoryEntry[];
  appliedDiscounts: IAppliedDiscount[];
  cancellation?: ICancellation;
  attachments: IAttachment[];
  notes?: string;
  internalNotes?: string;
  tags: string[];
  companyCreated?: boolean;
  companySelection?: ICompanySelection;
  ipAddress?: string;
  userAgent?: string;
  source: OrderSourceType;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (пока пусто) ===
export type IOrderMethods = {};

// === Статические методы модели ===
export interface IOrderModel extends Model<IOrder, {}, IOrderMethods> {
  // статические методы можно добавить позже
}

// === Тип документа с методами ===
export type OrderDocument = HydratedDocument<IOrder, IOrderMethods>;
