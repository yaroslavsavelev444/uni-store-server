import type { Query } from "express-serve-static-core";
import type { AuthRequest } from "../auth.js";
import type { IAttachment, IOrder, OrderStatusType } from "../order.types.js";

// ========== PARAMS ==========
export interface OrderIdParams {
  id: string;
}

export interface FileIdParams {
  id: string;
  fileId: string;
}

// ========== QUERY ==========
export interface GetOrdersQuery extends Query {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface GetAdminOrdersQuery extends GetOrdersQuery {
  userId?: string;
  page?: string;
  limit?: string;
}

// ========== BODY ==========
export interface CreateOrderBody {
  deliveryMethod: string;
  deliveryAddress?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  pickupPointId?: string;
  transportCompanyId?: string;
  deliveryNotes?: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  paymentMethod: string;
  isCompany?: boolean;
  existingCompanyId?: string;
  newCompanyData?: {
    companyName: string;
    companyAddress: string;
    taxNumber: string;
    legalAddress?: string;
    contactPerson?: string;
  };
  awaitingInvoice?: boolean;
  notes?: string;
}

export interface CancelOrderBody {
  reason: string;
}

export interface UpdateOrderStatusBody {
  status: OrderStatusType;
  comment?: string;
}

export interface AdminCancelOrderBody {
  reason: string;
  refundAmount?: number;
}

export interface UploadAttachmentBody {
  filePath: string;
}

// ========== RESPONSES ==========
export interface CreateOrderResponse {
  success: boolean;
  orderNumber: string;
  orderId: string;
  message: string;
}

export interface CancelOrderResponse {
  success: boolean;
  message: string;
  orderNumber: string;
}

export interface UpdateOrderStatusResponse {
  success: boolean;
  message: string;
  orderNumber: string;
  newStatus: OrderStatusType;
}

export interface UploadAttachmentResponse {
  success: boolean;
  message: string;
  order: IOrder;
  attachment: IAttachment;
}

export interface DeleteAttachmentResponse {
  success: boolean;
  message: string;
  order: IOrder;
}

export interface AdminCancelOrderResponse {
  success: boolean;
  message: string;
  orderNumber: string;
  refundAmount: number;
}

// Для списка заказов пользователя – просто массив заказов (тип уточнить по необходимости)
export type GetOrdersResponse = IOrder[];

// Для админского списка – объект с пагинацией
export interface GetAdminOrdersResponse {
  orders: IOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ========== TYPED REQUESTS ==========
export type GetOrdersReq = AuthRequest<
  {},
  GetOrdersResponse,
  {},
  GetOrdersQuery
>;

export type GetOrderReq = AuthRequest<OrderIdParams, IOrder, {}, {}>;

export type CreateOrderReq = AuthRequest<
  {},
  CreateOrderResponse,
  CreateOrderBody,
  {}
>;

export type CancelOrderReq = AuthRequest<
  OrderIdParams,
  CancelOrderResponse,
  CancelOrderBody,
  {}
>;

export type GetAdminOrdersReq = AuthRequest<
  {},
  GetAdminOrdersResponse,
  {},
  GetAdminOrdersQuery
>;

export type GetAdminOrderReq = AuthRequest<OrderIdParams, IOrder, {}, {}>;

export type UpdateOrderStatusReq = AuthRequest<
  OrderIdParams,
  UpdateOrderStatusResponse,
  UpdateOrderStatusBody,
  {}
>;

export type AdminCancelOrderReq = AuthRequest<
  OrderIdParams,
  AdminCancelOrderResponse,
  AdminCancelOrderBody,
  {}
>;

export type UploadAttachmentReq = AuthRequest<
  OrderIdParams,
  UploadAttachmentResponse,
  UploadAttachmentBody,
  {}
>;

export type DeleteAttachmentReq = AuthRequest<
  FileIdParams,
  DeleteAttachmentResponse,
  {},
  {}
>;
