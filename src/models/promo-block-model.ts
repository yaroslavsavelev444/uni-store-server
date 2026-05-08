import { model, Schema } from "mongoose";
import type {
  IPromoBlock,
  IPromoBlockMethods,
  PromoBlockModelType,
} from "../types/promoBlock.types.js";

const PromoBlockSchema = new Schema<
  IPromoBlock,
  PromoBlockModelType,
  IPromoBlockMethods
>(
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

// Если нет методов экземпляра, второй дженерик необязателен, но оставим для единообразия
export default model<IPromoBlock, PromoBlockModelType>(
  "PromoBlock",
  PromoBlockSchema,
);
