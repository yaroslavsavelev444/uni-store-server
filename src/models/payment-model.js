const { Schema, model } = require("mongoose");

const PaymentSchema = new Schema({
  robokassaInvId: {          // ← переименовано
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  order: {
    type: Schema.Types.ObjectId,
    ref: "Order",
    required: true,
    index: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: {
    value: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "RUB" },
  },
  status: {
    type: String,
    enum: ["pending", "succeeded", "canceled"],
    default: "pending",
    index: true,
  },
  metadata: Schema.Types.Mixed,
  paidAt: Date,
}, {
  timestamps: true,
});

PaymentSchema.index({ robokassaInvId: 1 });
PaymentSchema.index({ order: 1 });

module.exports = model("Payment", PaymentSchema);