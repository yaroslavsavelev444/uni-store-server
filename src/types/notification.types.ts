import type { HydratedDocument, Model, Types } from "mongoose";

export type NotificationType =
  | "system"
  | "subscription_match"
  | "chat"
  | "leave-review"
  | "order-updated"
  | "login-from-new-device"
  | "new_complaint_admin"
  | "complaint_created"
  | "complaint_status_changed";

export interface INotification {
  _id: string; // или Types.ObjectId
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, any>;
  link?: string;
  isRead: boolean;
  delivered: boolean;
  pushStatus: "pending" | "sent" | "failed";
  createdAt: Date;
  updatedAt?: Date;
}
export type PushStatus = "pending" | "sent" | "failed";

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
