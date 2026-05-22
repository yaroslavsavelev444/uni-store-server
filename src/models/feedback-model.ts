import { model, Schema, type Types } from "mongoose";
import type {
  FeedbackDocument,
  IFeedback,
  IFeedbackMethods,
  IFeedbackModel,
} from "../types/feedback.types.js";

const feedbackSchema = new Schema<IFeedback, IFeedbackModel, IFeedbackMethods>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    type: {
      type: String,
      enum: ["bug", "improvement", "feature", "other"],
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    userEmail: { type: String, trim: true, lowercase: true },
    userName: { type: String, trim: true },
    userRole: { type: String, enum: ["user", "lawyer", "admin", "moderator"] },
    status: {
      type: String,
      enum: [
        "new",
        "in_progress",
        "resolved",
        "closed",
        "duplicate",
        "wont_fix",
      ],
      default: "new",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
    attachments: {
      type: [String],
      ref: "File",
      default: [],
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    tags: [{ type: String, trim: true }],
    internalNotes: [
      {
        note: String,
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
        isPrivate: { type: Boolean, default: false },
      },
    ],
    viewCount: { type: Number, default: 0 },
    upvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    relatedTo: [{ type: Schema.Types.ObjectId, ref: "Feedback" }],
    duplicateOf: { type: Schema.Types.ObjectId, ref: "Feedback" },
    resolvedAt: Date,
    closedAt: Date,
    dueDate: Date,
    deviceInfo: {
      userAgent: String,
      platform: String,
      os: String,
      browser: String,
      screenResolution: String,
    },
    ipAddress: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    collection: "feedbacks",
  },
);

// === Индексы ===
feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ type: 1, createdAt: -1 });
feedbackSchema.index({ priority: 1, createdAt: -1 });
feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ assignedTo: 1, status: 1 });
feedbackSchema.index({ tags: 1 });
feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ updatedAt: -1 });

// === Хук pre-save (типизация через FeedbackDocument) ===
feedbackSchema.pre("save", function (this: FeedbackDocument, next) {
  if (this.status === "resolved" && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  if (this.status === "closed" && !this.closedAt) {
    this.closedAt = new Date();
  }
  next();
});

// === Статические методы ===
feedbackSchema.statics.getStats = async function (
  this: IFeedbackModel,
  userId: Types.ObjectId,
) {
  return {
    total: await this.countDocuments({ userId }),
    open: await this.countDocuments({
      userId,
      status: { $in: ["new", "in_progress"] },
    }),
    resolved: await this.countDocuments({ userId, status: "resolved" }),
    closed: await this.countDocuments({ userId, status: "closed" }),
  };
};

feedbackSchema.statics.getAdminStats = async function (this: IFeedbackModel) {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        avgDaysOpen: {
          $avg: {
            $divide: [
              { $subtract: [new Date(), "$createdAt"] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$count" },
        byStatus: {
          $push: {
            status: "$_id",
            count: "$count",
            avgDaysOpen: { $round: ["$avgDaysOpen", 1] },
          },
        },
      },
    },
  ]);

  return stats[0] || { total: 0, byStatus: [] };
};

// === Экспорт модели ===
export default model<IFeedback, IFeedbackModel>("Feedback", feedbackSchema);
