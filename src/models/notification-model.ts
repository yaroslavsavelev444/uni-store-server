import { model, Schema } from "mongoose";
import type {
  INotification,
  INotificationDocument,
  INotificationMethods,
  NotificationModelType,
} from "../types/notification.types.js";

const notificationSchema = new Schema<
  INotification,
  NotificationModelType,
  INotificationMethods
>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "system",
        "subscription_match",
        "chat",
        "review",
        "order",
        "login_from_new_device",
      ],
      default: "system",
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Object, default: {} },
    link: { type: String },
    isRead: { type: Boolean, default: false },
    delivered: { type: Boolean, default: false },
    pushStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
  },
  // без timestamps (поле createdAt уже есть, updatedAt не требуется)
);

notificationSchema.index({ userId: 1, type: 1, isRead: 1 });

export default model<INotificationDocument, NotificationModelType>(
  "Notification",
  notificationSchema,
);
