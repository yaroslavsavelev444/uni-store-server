const { NotificationModel } = require("../models/index.models");
const { validateNotification } = require("../utils/validateNotificationData");

const getNotificationsService = async (userData, limit = 10, skip = 0) => {
  const notifications = await NotificationModel.find({ userId: userData.id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  return notifications || [];
};

const getUnreadCount = async (userData) => {
  const count = await NotificationModel.countDocuments({
    userId: userData.id,
    isRead: false,
  });
  return count;
};

const markNotificationAsReadService = async (ids) => {
  await NotificationModel.updateMany(
    { _id: { $in: ids } },
    { $set: { isRead: true } }
  );

  return { success: true };
};

const deleteNotificationsService = async (user) => {
  await NotificationModel.deleteMany({ userId: user.id });
  return { success: true };
};

async function createNotification({ userId, type, title, body, data = {} }) {
  const { valid, missing } = validateNotification(type, data);

  if (!valid) {
    throw new Error(
      `Missing required fields for '${type}': ${missing.join(", ")}`
    );
  }

  return await NotificationModel.create({
    userId,
    type,
    title,
    body,
    data,
    isRead: false,
    delivered: false,
    pushStatus: "pending",
  });
}

module.exports = {
  getNotificationsService,
  markNotificationAsReadService,
  deleteNotificationsService,
  createNotification,
  getUnreadCount
};
