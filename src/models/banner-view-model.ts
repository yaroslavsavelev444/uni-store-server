import { model, Schema, Types } from "mongoose";
import type {
  BannerViewModelType,
  IBannerView,
  IBannerViewDocument,
} from "../types/bannerView.types.js";

const bannerViewSchema = new Schema<
  IBannerView,
  BannerViewModelType,
  IBannerViewMethods
>(
  {
    bannerId: {
      type: Schema.Types.ObjectId,
      ref: "Banner",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    viewedAt: {
      type: Date,
      default: null,
      index: true,
    },
    clicked: {
      type: Boolean,
      default: false,
      index: true,
    },
    clickedAt: {
      type: Date,
      default: null,
    },
    dismissed: {
      type: Boolean,
      default: false,
      index: true,
    },
    dismissedAt: {
      type: Date,
      default: null,
    },

    userAgent: { type: String },
    ipAddress: { type: String },
    referrer: { type: String },
    screenResolution: { type: String },

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastViewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    expireAfterSeconds: 63072000, // 2 года
  },
);

// Составной уникальный индекс
bannerViewSchema.index(
  { userId: 1, bannerId: 1 },
  {
    unique: true,
    background: true,
  },
);

// Индексы для аналитики
bannerViewSchema.index({ viewedAt: 1 });
bannerViewSchema.index({ clickedAt: 1 });
bannerViewSchema.index({ createdAt: 1 });
bannerViewSchema.index({ bannerId: 1, viewedAt: 1 });
bannerViewSchema.index({ bannerId: 1, clicked: 1 });

// Виртуальное поле ctr
bannerViewSchema.virtual("ctr").get(function (this: IBannerViewDocument) {
  return this.viewedAt && this.clicked ? 1 : 0;
});

// Метод incrementView
bannerViewSchema.methods.incrementView = async function (
  this: IBannerViewDocument,
) {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

// Статический метод getStats
bannerViewSchema.statics.getStats = async function (
  this: BannerViewModelType,
  bannerId: string | Types.ObjectId,
  startDate?: Date,
  endDate?: Date,
) {
  const matchStage: any = { bannerId: new Types.ObjectId(bannerId) };

  if (startDate || endDate) {
    matchStage.viewedAt = {};
    if (startDate) matchStage.viewedAt.$gte = startDate;
    if (endDate) matchStage.viewedAt.$lte = endDate;
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$bannerId",
        totalViews: { $sum: { $cond: [{ $ne: ["$viewedAt", null] }, 1, 0] } },
        totalClicks: { $sum: { $cond: ["$clicked", 1, 0] } },
        totalDismisses: { $sum: { $cond: ["$dismissed", 1, 0] } },
        uniqueUsers: { $addToSet: "$userId" },
        firstView: { $min: "$viewedAt" },
        lastView: { $max: "$viewedAt" },
      },
    },
    {
      $project: {
        bannerId: "$_id",
        totalViews: 1,
        totalClicks: 1,
        totalDismisses: 1,
        uniqueUsersCount: { $size: "$uniqueUsers" },
        ctr: {
          $cond: [
            { $eq: ["$totalViews", 0] },
            0,
            { $divide: ["$totalClicks", "$totalViews"] },
          ],
        },
        dismissRate: {
          $cond: [
            { $eq: ["$totalViews", 0] },
            0,
            { $divide: ["$totalDismisses", "$totalViews"] },
          ],
        },
        firstView: 1,
        lastView: 1,
      },
    },
  ]);
};

// Экспорт модели с правильными типами
export default model<IBannerViewDocument, BannerViewModelType>(
  "BannerView",
  bannerViewSchema,
);
