import { model, Schema } from "mongoose";

const bannerSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    description: { type: String },
    media: [{ type: String }],
    action: { type: String, enum: ["none", "link", "screen"], default: "none" },
    actionPayload: { type: String },
    startAt: { type: Date, required: false, default: () => new Date() },
    endAt: { type: Date, required: false, default: null },
    repeatable: { type: Boolean, default: false },
    priority: { type: Number, default: 0 },
    targeting: {
      roles: [{ type: String }],
    },
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
    },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export default model("Banner", bannerSchema);
