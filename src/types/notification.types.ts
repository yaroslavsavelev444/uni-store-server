import type { HydratedDocument, Model, Types } from "mongoose";

export type NotificationType =
  | "system"
  | "subscription_match"
  | "chat"
  | "review"
  | "order"
  | "login_from_new_device";

export type PushStatus = "pending" | "sent" | "failed";

// === Базовые поля, сохраняемые в БД ===
export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  link?: string;
  isRead: boolean;
  delivered: boolean;
  pushStatus: PushStatus;
  createdAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type INotificationMethods = {};

// === Статические методы модели ===
export interface INotificationModel extends Model<
  INotification,
  {},
  INotificationMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type NotificationDocument = HydratedDocument<
  INotification,
  INotificationMethods
>;
