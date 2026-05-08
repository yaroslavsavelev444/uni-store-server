import type { Document, Model, Types } from "mongoose";

export type NotificationType =
  | "system"
  | "subscription_match"
  | "chat"
  | "review"
  | "order"
  | "login_from_new_device";

export type PushStatus = "pending" | "sent" | "failed";

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

export type INotificationVirtuals = {};

export type INotificationMethods = {};

export interface NotificationModelType extends Model<
  INotificationDocument,
  {},
  INotificationMethods
> {}

export type INotificationDocument = Document<unknown, {}, INotification> &
  INotification &
  INotificationVirtuals &
  INotificationMethods;
