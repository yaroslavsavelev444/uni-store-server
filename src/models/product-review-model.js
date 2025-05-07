const { Schema, model } = require("mongoose");

const ProductReviewShema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    pros: { type: String, required: true },
    cons: { type: String, required: true },
    comment: { type: String, required: true },
    rating: { type: Number, required: true },
    status: { type: String, enum: ["pending", "active", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

module.exports = model("ProductReview", ProductReviewShema);
