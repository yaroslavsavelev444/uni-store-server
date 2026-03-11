import { model, Schema } from "mongoose";

const PromoBlockSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String },
    link: { type: String },
    reversed: { type: Boolean, default: false },
    page: { type: String, required: true },
  },
  { timestamps: true },
);

export default model("PromoBlock", PromoBlockSchema);
