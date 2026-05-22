const mongoose = require("mongoose");

const discountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  
  // Единый тип
  type: {
    type: String,
    enum: ["percentage", "fixed", "quantity_based"],
    default: "percentage",
    required: true
  },
  
  discountPercent: { type: Number, required: true, min: 0, max: 100 },
  fixedAmount: { type: Number, min: 0 }, // для fixed скидок
  
  minTotalQuantity: { type: Number, min: 1 },
  minTotalAmount: { type: Number, min: 0 },
  
  appliesToAllProducts: { type: Boolean, default: true },
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  
  isActive: { type: Boolean, default: true },
  isUnlimited: { type: Boolean, default: false },
  startAt: { type: Date, default: Date.now },
  endAt: { type: Date, default: null },
  
  priority: { type: Number, default: 1, min: 1, max: 10 },
  code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  
  totalUses: { type: Number, default: 0 },
  totalDiscountAmount: { type: Number, default: 0 },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Индексы
discountSchema.index({ isActive: 1, startAt: 1, endAt: 1 });
discountSchema.index({ priority: 1, createdAt: -1 });

// Виртуальное поле
discountSchema.virtual("isCurrentlyActive").get(function() {
  if (!this.isActive) return false;
  const now = new Date();
  if (now < this.startAt) return false;
  if (!this.isUnlimited && this.endAt && now > this.endAt) return false;
  return true;
});

// === ОСНОВНОЙ МЕТОД РАСЧЁТА СКИДКИ ===
discountSchema.methods.calculateDiscount = function(cartData) {
  if (!this.isCurrentlyActive) {
    return { applicable: false, discountAmount: 0, message: "Скидка не активна" };
  }

  const { totalAmount, totalQuantity } = cartData;

  // Проверка условий
  if (this.minTotalQuantity && totalQuantity < this.minTotalQuantity) {
    const needed = this.minTotalQuantity - totalQuantity;
    return {
      applicable: false,
      message: `Добавьте еще ${needed} ${this.getQuantityWord(needed)} для получения скидки ${this.discountPercent}%`,
      needed: { quantity: needed },
      current: { quantity: totalQuantity },
      discountAmount: 0
    };
  }

  if (this.minTotalAmount && totalAmount < this.minTotalAmount) {
    const needed = this.minTotalAmount - totalAmount;
    return {
      applicable: false,
      message: `Добавьте товаров на ${this.formatPrice(needed)} для получения скидки ${this.discountPercent}%`,
      needed: { amount: needed },
      current: { amount: totalAmount },
      discountAmount: 0
    };
  }

  // Расчёт суммы скидки
  let discountAmount = 0;
  let message = '';

  if (this.type === "percentage" || this.type === "quantity_based") {
    discountAmount = Math.round(totalAmount * (this.discountPercent / 100) * 100) / 100;
    message = `Скидка ${this.discountPercent}% применена`;
  } else if (this.type === "fixed") {
    discountAmount = this.fixedAmount || 0;
    message = `Скидка ${this.formatPrice(discountAmount)} применена`;
  }

  return {
    applicable: true,
    discountAmount,
    discountPercent: this.discountPercent,
    message
  };
};

// Добавляем метод для проверки применимости скидки к товару
discountSchema.methods.isApplicableToProduct = function(product) {
  // Если скидка не активна в данный момент
  if (!this.isCurrentlyActive) {
    return false;
  }
  
  // Если скидка применяется ко всем товарам
  if (this.appliesToAllProducts) {
    return true;
  }
  
  // Проверка по конкретным товарам
  if (this.applicableProducts && this.applicableProducts.length > 0) {
    const productId = product._id ? product._id.toString() : product.toString();
    return this.applicableProducts.some(p => p.toString() === productId);
  }
  
  // Проверка по категориям
  if (this.applicableCategories && this.applicableCategories.length > 0) {
    const categoryId = product.category ? product.category.toString() : null;
    if (!categoryId) return false;
    
    return this.applicableCategories.some(c => c.toString() === categoryId);
  }
  
  return false;
};

discountSchema.methods.getQuantityWord = function(quantity) {
  const forms = ['штуку', 'штуки', 'штук'];
  const n = Math.abs(quantity) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
};

discountSchema.methods.formatPrice = function(amount) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
};

module.exports = mongoose.model("Discount", discountSchema);