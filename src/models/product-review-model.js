const { Schema, model } = require("mongoose");

const ProductReviewShema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    text: { type: String, required: true },
    rating: { type: Number, required: true },
    status: { type: String, enum: ["pending", "active", "rejected"], required: true, default: "pending" },
  },
  {
    timestamps: true,
  }
);

module.exports = model("ProductReview", ProductReviewShema);
