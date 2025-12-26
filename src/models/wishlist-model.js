const { Schema, model, Types } = require("mongoose");

const WishlistItemSchema = new Schema(
  {
    product: { 
      type: Schema.Types.ObjectId, 
      ref: "Product", 
      required: true,
      index: true
    },
    addedAt: { 
      type: Date, 
      default: Date.now 
    },
    notes: { 
      type: String, 
      maxlength: 500,
      trim: true 
    }
  },
  { _id: true }
);

const WishlistSchema = new Schema(
  {
    user: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      unique: true,
      index: true 
    },
    items: [WishlistItemSchema],
    updatedAt: { 
      type: Date, 
      default: Date.now 
    },
    settings: {
      notifyOnPriceDrop: { type: Boolean, default: true },
      notifyOnRestock: { type: Boolean, default: true },
      sortBy: { 
        type: String, 
        enum: ["addedAt", "priceAsc", "priceDesc", "popularity", "name"],
        default: "addedAt"
      }
    }
  },
  {
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Виртуальное поле для подсчета количества товаров
WishlistSchema.virtual("totalItems").get(function() {
  return this.items.length;
});

// Виртуальное поле для получения только доступных товаров
WishlistSchema.virtual("availableItems").get(function() {
  return this.items.filter(item => 
    item.product && 
    item.product.status === "available" && 
    item.product.isVisible
  ).length;
});

// Индексы
WishlistSchema.index({ "items.product": 1 });
WishlistSchema.index({ "updatedAt": -1 });
WishlistSchema.index({ "user": 1, "addedAt": -1 });

// Middleware для обновления updatedAt
WishlistSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

// Статический метод для поиска вишлиста с populate и проверкой доступности
WishlistSchema.statics.findByUser = function(userId) {
  return this.findOne({ user: userId })
    .populate({
      path: "items.product",
      select: "title sku priceForIndividual finalPriceForIndividual discount stockQuantity reservedQuantity minOrderQuantity maxOrderQuantity status isVisible mainImage manufacturer category specifications weight warrantyMonths viewsCount purchasesCount",
      match: { isVisible: true }, // Всегда получаем товар, даже если не доступен
      populate: {
        path: "category",
        select: "name slug"
      }
    });
};

// Метод для проверки, есть ли товар в избранном
WishlistSchema.methods.hasProduct = function(productId) {
  return this.items.some(item => 
    item.product && 
    item.product._id.toString() === productId.toString()
  );
};

// Метод для добавления товара с проверкой дубликатов
WishlistSchema.methods.addProduct = function(productId, notes) {
  if (this.hasProduct(productId)) {
    throw new Error("Товар уже в избранном");
  }
  
  this.items.push({
    product: productId,
    addedAt: new Date(),
    notes: notes || ""
  });
  
  return this.save();
};

// Метод для удаления товара
WishlistSchema.methods.removeProduct = function(productId) {
  const initialLength = this.items.length;
  this.items = this.items.filter(item => 
    item.product.toString() !== productId.toString()
  );
  
  if (this.items.length === initialLength) {
    throw new Error("Товар не найден в избранном");
  }
  
  return this.save();
};

// Метод для обновления настроек
WishlistSchema.methods.updateSettings = function(settings) {
  this.settings = { ...this.settings, ...settings };
  return this.save();
};

module.exports = model("Wishlist", WishlistSchema);