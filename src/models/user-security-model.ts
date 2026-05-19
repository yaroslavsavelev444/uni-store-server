// src/models/UserSecurity.model.ts
import { model, Schema, Types } from "mongoose";
import type {
  IUserSecurity,
  IUserSecurityMethods,
  IUserSecurityModel,
} from "../types/userSecurity.types.js";

const UserSecuritySchema = new Schema<
  IUserSecurity,
  IUserSecurityModel,
  IUserSecurityMethods
>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    twoFACodeHash: { type: Schema.Types.Buffer, default: null }, // изменено на Buffer
    twoFACodeExpiresAt: { type: Date, default: null },
    twoFAAttempts: { type: Number, default: 0 },
    resetTokenExpiration: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenStatus: { type: String, default: "pending" },
    resetTokenAttempts: { type: Number, default: 0 }, // добавлено
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

UserSecuritySchema.index({ userId: 1 }, { unique: true });

export default model<IUserSecurity, IUserSecurityModel>(
  "UserSecurity",
  UserSecuritySchema,
);
