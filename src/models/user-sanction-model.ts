import { model, Schema, Types } from "mongoose";
import type {
  IUserSanction,
  IUserSanctionMethods,
  IUserSanctionModel,
  UserSanctionDocument,
} from "../types/userSanction.types.js";

const UserSanctionSchema = new Schema<
  IUserSanction,
  IUserSanctionModel,
  IUserSanctionMethods
>(
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
      type: Number,
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
    toObject: { virtuals: true },
  },
);

// Виртуальные поля – не дублируются в IUserSanction
UserSanctionSchema.virtual("isExpired").get(function (
  this: UserSanctionDocument,
) {
  return new Date() > this.expiresAt;
});

UserSanctionSchema.virtual("remainingTime").get(function (
  this: UserSanctionDocument,
) {
  if (this.duration === 0) return "Бессрочно";

  const remaining = (this.expiresAt?.getTime() ?? 0) - Date.now();
  if (remaining <= 0) return "Истекло";

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}ч ${minutes}м`;
});

// Pre‑save: автоматическая установка expiresAt
UserSanctionSchema.pre("save", function (this: UserSanctionDocument, next) {
  if (this.duration === 0) {
    // Пожизненная блокировка – через 100 лет
    this.expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
  } else if (!this.expiresAt) {
    // Устанавливаем дату истечения на основе duration (в часах)
    this.expiresAt = new Date(Date.now() + this.duration * 60 * 60 * 1000);
  }
  next();
});

// Индексы
UserSanctionSchema.index({ user: 1, isActive: 1, expiresAt: 1 });
UserSanctionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

export default model<IUserSanction, IUserSanctionModel>(
  "UserSanction",
  UserSanctionSchema,
);
