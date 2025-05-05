const { Schema, model } = require("mongoose");

const CartItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true }, // Привязка к продукту
    quantity: { type: Number, required: true, min: 1 }, // Количество товара в корзине
  },
  { timestamps: true }
);

const CartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Ссылка на пользователя
    items: [CartItemSchema], // Массив товаров в корзине
    createdAt: { type: Date, default: Date.now }, // Время создания корзины
  },
  { timestamps: true }
);


module.exports = model("Cart", CartSchema);