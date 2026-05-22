// models/notificationModel.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  // Получатель уведомления
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // Тип уведомления (чтобы понимать источник)
  type: {
  type: String,
  enum: [
    "system",
    "subscription_match",
    "chat",
    "review",
    "order",
    "login_from_new_device" // добавляем новый тип
  ],
  default: "system",
},

  // Заголовок уведомления
  title: { type: String, required: true },

  // Основной текст уведомления (описание)
  body: { type: String, required: true },

  // Полезные данные (гибкий объект, можно хранить всё)
  data: {
    type: Object,
    default: {}, // сюда пойдёт meta — бизнес, подписка и т.д.
  },

  // Ссылка для перехода (например, на карточку бизнеса)
  link: { type: String },

  // Флаги состояния
  isRead: { type: Boolean, default: false },
  delivered: { type: Boolean, default: false },

  // Статус отправки пушей/уведомлений
  pushStatus: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
  },

  // Дата создания
  createdAt: { type: Date, default: Date.now },
});

// Индексы для ускорения выборок
notificationSchema.index({ userId: 1, type: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);