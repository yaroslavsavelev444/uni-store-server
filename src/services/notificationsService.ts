//@ts-nocheck
import { NotificationModel } from "../models/index.models.js";
import type {
  CreateNotificationParams,
  DeleteNotificationsResponse,
  INotification,
  MarkAsReadResponse,
  UserData,
} from "../types/notification.js";

import validateNotificationData from "../utils/validateNotificationData.js";

const { validateNotification } = validateNotificationData;

export const getNotificationsService = async (
  userData: UserData,
  limit: number = 10,
  skip: number = 0,
): Promise<INotification[]> => {
  return await NotificationModel.find({ userId: userData.id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean<INotification[]>();
};

export const getUnreadCount = async (userData: UserData): Promise<number> => {
  return await NotificationModel.countDocuments({
    userId: userData.id,
    isRead: false,
  });
};

export const markNotificationAsReadService = async (
  ids: string[],
): Promise<MarkAsReadResponse> => {
  await NotificationModel.updateMany(
    { _id: { $in: ids } },
    { $set: { isRead: true } },
  );
  return { success: true };
};

export const deleteNotificationsService = async (
  user: UserData,
): Promise<DeleteNotificationsResponse> => {
  await NotificationModel.deleteMany({ userId: user.id });
  return { success: true };
};

/**
 * Основная функция создания уведомления
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<INotification> {
  const { userId, type, title, body, data = {} } = params;

  const { valid, missing } = validateNotification(type, data);

  if (!valid) {
    throw new Error(
      `Missing required fields for '${type}': ${missing?.join(", ")}`,
    );
  }

  const notification = new NotificationModel({
    userId,
    type,
    title,
    body,
    data,
    isRead: false,
  });

  const saved = await notification.save();
  return saved.toObject() as INotification;
}
