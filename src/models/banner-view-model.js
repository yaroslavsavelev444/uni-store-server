const mongoose = require("mongoose");

const bannerViewSchema = new mongoose.Schema({
  bannerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Banner", 
    required: true,
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true 
  },
  
  // Основные события
  viewedAt: { 
    type: Date, 
    default: null,
    index: true 
  },
  clicked: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  clickedAt: { 
    type: Date, 
    default: null 
  },
  dismissed: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  dismissedAt: { 
    type: Date, 
    default: null 
  },
  
  // Дополнительные метрики (можно собирать из headers)
  userAgent: { type: String },
  ipAddress: { type: String },
  referrer: { type: String },
  screenResolution: { type: String },
  
  // Для аналитики
  viewCount: { 
    type: Number, 
    default: 0,
    min: 0 
  },
  lastViewedAt: { 
    type: Date 
  },
  
}, { 
  timestamps: true,
  // Автоматическое удаление старых записей (например, через 2 года)
  expireAfterSeconds: 63072000 // 2 года в секундах
});

// Составной уникальный индекс
bannerViewSchema.index({ userId: 1, bannerId: 1 }, { 
  unique: true,
  background: true 
});

// Индексы для аналитических запросов
bannerViewSchema.index({ viewedAt: 1 });
bannerViewSchema.index({ clickedAt: 1 });
bannerViewSchema.index({ createdAt: 1 });
bannerViewSchema.index({ bannerId: 1, viewedAt: 1 });
bannerViewSchema.index({ bannerId: 1, clicked: 1 });

// Виртуальное поле для вычисления CTR
bannerViewSchema.virtual('ctr').get(function() {
  return this.viewedAt && this.clicked ? 1 : 0;
});

// Метод для инкремента счетчика просмотров
bannerViewSchema.methods.incrementView = async function() {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

// Статический метод для получения статистики
bannerViewSchema.statics.getStats = async function(bannerId, startDate, endDate) {
  const matchStage = { bannerId: mongoose.Types.ObjectId(bannerId) };
  
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
        lastView: { $max: "$viewedAt" }
      }
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
            { $divide: ["$totalClicks", "$totalViews"] }
          ]
        },
        dismissRate: {
          $cond: [
            { $eq: ["$totalViews", 0] },
            0,
            { $divide: ["$totalDismisses", "$totalViews"] }
          ]
        },
        firstView: 1,
        lastView: 1
      }
    }
  ]);
};

module.exports = mongoose.model("BannerView", bannerViewSchema);