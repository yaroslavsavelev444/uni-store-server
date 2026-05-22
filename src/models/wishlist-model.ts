import { model, Schema, Types } from "mongoose";
import type {
  IWishlist,
  IWishlistItem,
  IWishlistMethods,
  IWishlistModel,
  IWishlistSettings,
  WishlistDocument,
} from "../types/wishlist.types.js";

// Схема для вложенного документа WishlistItem (с _id)
const WishlistItemSchema = new Schema<IWishlistItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
  },
  { _id: true },
);

// Основная схема Wishlist
const WishlistSchema = new Schema<IWishlist, IWishlistModel, IWishlistMethods>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: [WishlistItemSchema],
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    settings: {
      notifyOnPriceDrop: { type: Boolean, default: true },
      notifyOnRestock: { type: Boolean, default: true },
      sortBy: {
        type: String,
        enum: ["addedAt", "priceAsc", "priceDesc", "popularity", "name"],
        default: "addedAt",
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// === Виртуальные поля (не дублируются в IWishlist) ===
WishlistSchema.virtual("totalItems").get(function (this: WishlistDocument) {
  return this.items.length;
});

WishlistSchema.virtual("availableItems").get(function (this: WishlistDocument) {
  return this.items.filter(
    (item) =>
      item.product &&
      (item.product as any)?.status === "available" &&
      (item.product as any)?.isVisible,
  ).length;
});

// === Индексы ===
WishlistSchema.index({ "items.product": 1 });
WishlistSchema.index({ updatedAt: -1 });
WishlistSchema.index({ user: 1, "items.addedAt": -1 });

// === Pre‑save hook ===
WishlistSchema.pre("save", function (this: WishlistDocument, next) {
  this.updatedAt = new Date();
  next();
});

// === Статический метод ===
WishlistSchema.statics.findByUser = function (
  this: IWishlistModel,
  userId: Types.ObjectId | string,
) {
  return this.findOne({ user: userId })
    .populate({
      path: "items.product",
      select:
        "title sku priceForIndividual finalPriceForIndividual discount minOrderQuantity maxOrderQuantity status isVisible manufacturer category specifications weight warrantyMonths viewsCount purchasesCount",
      match: { isVisible: true },
      populate: {
        path: "category",
        select: "name slug",
      },
    })
    .exec() as Promise<WishlistDocument | null>;
};

// === Методы экземпляра ===
WishlistSchema.methods.hasProduct = function (
  this: WishlistDocument,
  productId: Types.ObjectId | string,
): boolean {
  return this.items.some(
    (item) =>
      item.product && item.product._id.toString() === productId.toString(),
  );
};

WishlistSchema.methods.addProduct = async function (
  this: WishlistDocument,
  productId: Types.ObjectId | string,
  notes?: string,
): Promise<WishlistDocument> {
  if (this.hasProduct(productId)) {
    throw new Error("Товар уже в избранном");
  }

  this.items.push({
    product: new Types.ObjectId(productId.toString()),
    addedAt: new Date(),
    notes: notes || "",
  });

  return this.save();
};

WishlistSchema.methods.removeProduct = async function (
  this: WishlistDocument,
  productId: Types.ObjectId | string,
): Promise<WishlistDocument> {
  const initialLength = this.items.length;
  this.items = this.items.filter(
    (item) => item.product._id.toString() !== productId.toString(),
  );

  if (this.items.length === initialLength) {
    throw new Error("Товар не найден в избранном");
  }

  return this.save();
};

WishlistSchema.methods.updateSettings = async function (
  this: WishlistDocument,
  settings: Partial<IWishlistSettings>,
): Promise<WishlistDocument> {
  this.settings = { ...this.settings, ...settings };
  return this.save();
};

// === Экспорт модели ===
export default model<IWishlist, IWishlistModel>("Wishlist", WishlistSchema);
