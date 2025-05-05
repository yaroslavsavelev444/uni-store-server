const { Schema, model } = require("mongoose");

const OrgReviewShema = new Schema(
  {
    userId : { type: Schema.Types.ObjectId, ref: "User" },
    theme: { type: String, required: true },
    comment: { type: String, required: true },
    status: { type: String, enum: ["pending", "active", "rejected"], required: true, default: "pending" },
  },
  {
    timestamps: true,
  }
);

module.exports = model("OrgReview", OrgReviewShema);
