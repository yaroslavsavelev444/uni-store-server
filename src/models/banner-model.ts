import { model, Schema, Types } from "mongoose";
import {
  BannerAction,
  BannerActionType,
  BannerStatus,
  BannerStatusType,
  type IBanner,
} from "../types/banner.types.js";

const bannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    description: { type: String },
    media: [{ type: String }],
    action: {
      type: String,
      enum: Object.values(BannerAction),
      default: BannerAction.None,
    },
    actionPayload: { type: String },
    startAt: {
      type: Date,
      required: false,
      default: () => new Date(),
    },
    endAt: { type: Date, required: false, default: null },
    repeatable: { type: Boolean, default: false },
    priority: { type: Number, default: 0 },
    targeting: {
      roles: [{ type: String }],
    },
    status: {
      type: String,
      enum: Object.values(BannerStatus),
      default: BannerStatus.Draft,
    },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Экспорт модели с правильным типом
export default model<IBanner>("Banner", bannerSchema);
