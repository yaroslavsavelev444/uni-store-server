const { Schema, model, Types } = require("mongoose");

const roomSchema = new Schema(
  {
    users: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    product: {
      type: Types.ObjectId,
      ref: "Product",
      index: true,
    },
    lastMessage: {
      sender: { type: Schema.Types.ObjectId, ref: "User" },
      text: String,
      createdAt: Date,
    },
    unreadCounts: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        count: { type: Number, default: 0 }
      }
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

roomSchema.index({ product: 1 });
roomSchema.index({ "lastMessage.createdAt": -1 });

module.exports = model("Room", roomSchema);