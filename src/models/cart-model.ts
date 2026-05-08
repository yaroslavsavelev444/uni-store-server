import { model, Schema, type Types } from "mongoose";
import type {
  CartModelType,
  ICart,
  ICartDocument,
  ICartItem,
} from "../types/cart.types.js";

// Схема для вложенного документа CartItem
const CartItemSchema = new Schema<ICartItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Количество не может быть меньше 1"],
      validate: {
        validator: (value: number) => typeof value === "number" && value >= 1,
        message: "Количество должно быть числом не менее 1",
      },
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

// Основная схема Cart
const CartSchema = new Schema<ICart, CartModelType, ICartMethods>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: [CartItemSchema],
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// Виртуальное поле totalItems
CartSchema.virtual("totalItems").get(function (this: ICartDocument) {
  return this.items.reduce(
    (sum: number, item: ICartItem) => sum + item.quantity,
    0,
  );
});

// Индексы
CartSchema.index({ "items.product": 1 });
CartSchema.index({ updatedAt: -1 });

// Middleware для обновления updatedAt
CartSchema.pre("save", function (this: ICartDocument, next) {
  this.updatedAt = new Date();
  next();
});

// Статический метод findByUser
CartSchema.statics.findByUser = async function (
  this: CartModelType,
  userId: string | Types.ObjectId,
): Promise<ICartDocument | null> {
  return this.findOne({ user: userId }).populate({
    path: "items.product",
    select:
      "title priceForIndividual finalPriceForIndividual discount minOrderQuantity maxOrderQuantity status isVisible images sku weight",
    match: {
      status: { $in: ["available", "preorder"] },
      isVisible: true,
    },
  }) as Promise<ICartDocument | null>;
};

export default model<ICartDocument, CartModelType>("Cart", CartSchema);
