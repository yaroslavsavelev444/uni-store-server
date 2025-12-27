// models/ProductReview.model.js
const { Schema, model } = require("mongoose");

const ProductReviewSchema = new Schema(
  {
    user: { 
      type: Schema.Types.ObjectId, 
      ref: "User",
      required: true 
    },
    product: { 
      type: Schema.Types.ObjectId, 
      ref: "Product",
      required: true,
      index: true
    },
    rating: { 
      type: Number, 
      required: true,
      min: 1,
      max: 5
    },
    title: { type: String },
    comment: { type: String, required: true },
    pros: [{ type: String }],
    cons: [{ type: String }],
    status: { 
      type: String, 
      enum: ["pending", "approved", "rejected"], 
      default: "pending",
      index: true
    },
    isVerifiedPurchase: { 
      type: Boolean, 
      default: false 
    },
    helpfulCount: { 
      type: Number, 
      default: 0 
    },
    notHelpfulCount: { 
      type: Number, 
      default: 0 
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Индекс для быстрого поиска отзывов пользователя на товар
ProductReviewSchema.index({ user: 1, product: 1 }, { unique: true });

// Виртуальное поле для проверки, если пользователь оставил отзыв
ProductReviewSchema.virtual('author', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
});

module.exports = model("ProductReview", ProductReviewSchema);