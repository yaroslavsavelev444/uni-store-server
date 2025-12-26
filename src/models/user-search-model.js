const mongoose = require("mongoose");

const userSearchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    selectedProductId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  },
  { timestamps: true }
);

// Уникальность по userId + selectedProductId
userSearchSchema.index({ userId: 1, selectedProductId: 1 }, { unique: true });

module.exports = mongoose.model("UserSearch", userSearchSchema);