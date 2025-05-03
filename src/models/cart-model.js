const { Schema, model } = require("mongoose");

const CartItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true }, // Привязка к продукту
    quantity: { type: Number, required: true, min: 1 }, // Количество товара в корзине
    price: { type: Number, required: true }, // Цена товара на момент добавления в корзину
  },
  { timestamps: true }
);

const CartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Ссылка на пользователя
    items: [CartItemSchema], // Массив товаров в корзине
    totalPrice: { type: Number, default: 0 }, // Общая цена корзины
    createdAt: { type: Date, default: Date.now }, // Время создания корзины
  },
  { timestamps: true }
);

// Мидлвар для пересчета общей стоимости корзины при добавлении или удалении товара
CartSchema.pre("save", function (next) {
  this.totalPrice = this.items.reduce((total, item) => total + item.price * item.quantity, 0);
  next();
});

module.exports = model("Cart", CartSchema);