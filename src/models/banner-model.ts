import { model, Schema } from "mongoose";
import {
  BannerAction,
  BannerStatus,
  type IBanner,
  type IBannerMethods,
  type IBannerModel,
} from "../types/banner.types.js";

const bannerSchema = new Schema<IBanner, IBannerModel, IBannerMethods>(
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

export default model<IBanner, IBannerModel>("Banner", bannerSchema);
