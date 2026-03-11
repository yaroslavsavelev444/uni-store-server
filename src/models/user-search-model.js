import { model, Schema } from "mongoose";

const userSearchSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    selectedProductId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  },
  { timestamps: true },
);

// Уникальность по userId + selectedProductId
userSearchSchema.index({ userId: 1, selectedProductId: 1 }, { unique: true });

export default model("UserSearch", userSearchSchema);
