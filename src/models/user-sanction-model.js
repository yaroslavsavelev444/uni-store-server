// models/user-sanction-model.js
const { Schema, model } = require("mongoose");

const UserSanctionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["block", "warning", "restriction"],
      default: "block",
      required: true,
    },
    reason: {
      type: String,
      default: "Нарушение правил сообщества",
    },
    duration: {
      type: Number, // длительность в часах, 0 = пожизненно
      default: 24,
      min: 0,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    metadata: {
      ip: { type: String },
      userAgent: { type: String },
      additionalInfo: { type: Schema.Types.Mixed },
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Виртуальное поле для проверки, истекла ли санкция
UserSanctionSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Виртуальное поле для получения оставшегося времени
UserSanctionSchema.virtual('remainingTime').get(function() {
  if (this.duration === 0) return 'Бессрочно';
  
  const remaining = this.expiresAt - new Date();
  if (remaining <= 0) return 'Истекло';
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}ч ${minutes}м`;
});

// Middleware для автоматической установки expiresAt
UserSanctionSchema.pre('save', function(next) {
  if (this.duration === 0) {
    // Пожизненная блокировка - ставим дату через 100 лет
    this.expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
  } else if (!this.expiresAt) {
    // Устанавливаем дату истечения на основе duration (в часах)
    this.expiresAt = new Date(Date.now() + this.duration * 60 * 60 * 1000);
  }
  next();
});

// Индексы для оптимизации
UserSanctionSchema.index({ user: 1, isActive: 1, expiresAt: 1 });
UserSanctionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Автоматическое удаление просроченных

module.exports = model("UserSanction", UserSanctionSchema);