import { model, Schema, type Types } from "mongoose";
import type {
  DiscountModel,
  ICartData,
  IDiscountDocument,
} from "../types/discount.types.js";

const discountSchema = new Schema<IDiscountDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: ["percentage", "fixed", "quantity_based"],
      default: "percentage",
      required: true,
    },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    fixedAmount: { type: Number, min: 0 },
    minTotalQuantity: { type: Number, min: 1 },
    minTotalAmount: { type: Number, min: 0 },
    appliesToAllProducts: { type: Boolean, default: true },
    applicableCategories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    applicableProducts: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    isActive: { type: Boolean, default: true },
    isUnlimited: { type: Boolean, default: false },
    startAt: { type: Date, default: Date.now },
    endAt: { type: Date, default: null },
    priority: { type: Number, default: 1, min: 1, max: 10 },
    code: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    totalUses: { type: Number, default: 0 },
    totalDiscountAmount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// Индексы
discountSchema.index({ isActive: 1, startAt: 1, endAt: 1 });
discountSchema.index({ priority: 1, createdAt: -1 });

// Виртуальное поле isCurrentlyActive
discountSchema.virtual("isCurrentlyActive").get(function (
  this: IDiscountDocument,
) {
  if (!this.isActive) return false;
  const now = new Date();
  if (now < this.startAt) return false;
  if (!this.isUnlimited && this.endAt && now > this.endAt) return false;
  return true;
});

// Метод calculateDiscount
discountSchema.methods.calculateDiscount = function (
  this: IDiscountDocument,
  cartData: ICartData,
) {
  if (!this.isCurrentlyActive) {
    return {
      applicable: false,
      discountAmount: 0,
      message: "Скидка не активна",
    };
  }

  const { totalAmount, totalQuantity } = cartData;

  if (this.minTotalQuantity && totalQuantity < this.minTotalQuantity) {
    const needed = this.minTotalQuantity - totalQuantity;
    return {
      applicable: false,
      message: `Добавьте еще ${needed} ${this.getQuantityWord(needed)} для получения скидки ${this.discountPercent}%`,
      needed: { quantity: needed },
      current: { quantity: totalQuantity },
      discountAmount: 0,
    };
  }

  if (this.minTotalAmount && totalAmount < this.minTotalAmount) {
    const needed = this.minTotalAmount - totalAmount;
    return {
      applicable: false,
      message: `Добавьте товаров на ${this.formatPrice(needed)} для получения скидки ${this.discountPercent}%`,
      needed: { amount: needed },
      current: { amount: totalAmount },
      discountAmount: 0,
    };
  }

  let discountAmount = 0;
  let message = "";

  if (this.type === "percentage" || this.type === "quantity_based") {
    discountAmount =
      Math.round(totalAmount * (this.discountPercent / 100) * 100) / 100;
    message = `Скидка ${this.discountPercent}% применена`;
  } else if (this.type === "fixed") {
    discountAmount = this.fixedAmount || 0;
    message = `Скидка ${this.formatPrice(discountAmount)} применена`;
  }

  return {
    applicable: true,
    discountAmount,
    discountPercent: this.discountPercent,
    message,
  };
};

// Метод isApplicableToProduct
discountSchema.methods.isApplicableToProduct = function (
  this: IDiscountDocument,
  product: Types.ObjectId | { _id: Types.ObjectId; category?: Types.ObjectId },
) {
  if (!this.isCurrentlyActive) return false;
  if (this.appliesToAllProducts) return true;

  const productId = typeof product === "object" ? product._id : product;

  if (this.applicableProducts && this.applicableProducts.length > 0) {
    return this.applicableProducts.some((p) => p.equals(productId));
  }

  if (
    this.applicableCategories &&
    this.applicableCategories.length > 0 &&
    typeof product === "object"
  ) {
    const categoryId = product.category;
    if (!categoryId) return false;
    return this.applicableCategories.some((c) => c.equals(categoryId));
  }

  return false;
};

// Вспомогательный метод getQuantityWord
discountSchema.methods.getQuantityWord = function (
  this: IDiscountDocument,
  quantity: number,
) {
  const forms = ["штуку", "штуки", "штук"];
  const n = Math.abs(quantity) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
};

// Вспомогательный метод formatPrice
discountSchema.methods.formatPrice = function (
  this: IDiscountDocument,
  amount: number,
) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default model<IDiscountDocument, DiscountModel>(
  "Discount",
  discountSchema,
);
