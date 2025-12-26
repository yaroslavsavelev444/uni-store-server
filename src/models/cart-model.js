const { Schema, model, Types } = require("mongoose");

const CartItemSchema = new Schema(
  {
    product: { 
      type: Schema.Types.ObjectId, 
      ref: "Product", 
      required: true,
      index: true
    },
    quantity: { 
      type: Number, 
      required: true, 
      min: [1, "Количество не может быть меньше 1"],
      validate: {
        validator: function(value) {
          return typeof value === 'number' && value >= 1;
        },
        message: "Количество должно быть числом не менее 1"
      }
    },
    addedAt: { 
      type: Date, 
      default: Date.now 
    }
  },
  { _id: true }
);


const CartSchema = new Schema(
  {
    user: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      unique: true,
      index: true 
    },
    items: [CartItemSchema],
    updatedAt: { 
      type: Date, 
      default: Date.now 
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

// Виртуальное поле для подсчета общего количества товаров
CartSchema.virtual("totalItems").get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Индексы
CartSchema.index({ "items.product": 1 });
CartSchema.index({ "updatedAt": -1 });

// Middleware для обновления updatedAt
CartSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

// Статический метод для поиска корзины с populate
CartSchema.statics.findByUser = function(userId) {
  return this.findOne({ user: userId })
    .populate({
      path: "items.product",
      select: "title priceForIndividual finalPriceForIndividual discount stockQuantity reservedQuantity minOrderQuantity maxOrderQuantity status isVisible mainImage sku",
      match: { 
        status: { $in: ["available", "preorder"] },
        isVisible: true 
      }
    });
};

module.exports = model("Cart", CartSchema);