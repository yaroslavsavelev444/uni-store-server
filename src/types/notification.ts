import type { Document, Types } from "mongoose";
import type { IUser } from "./user.types.js";

export type NotificationType =
  | "system"
  | "subscription_match"
  | "chat"
  | "review"
  | "order"
  | "leave-review"
  | "login_from_new_device";

export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId | IUser;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  link?: string;
  isRead: boolean;
  createdAt: Date;
}

// Параметры для создания уведомления (используется в сервисе и очереди)
export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  sendSocket?: boolean; // по умолчанию true
}

// Данные задачи в очереди Bull
export interface NotificationJobData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
}

// Вспомогательные типы для сервиса
export interface UserData {
  id: string;
}

export interface MarkAsReadResponse {
  success: boolean;
}

export interface DeleteNotificationsResponse {
  success: boolean;
}

export interface PushNotificationOption {
  sound?: string;
  priority?: "high" | "normal";
  ttl?: number; // время жизни
  badge?: number;
}
