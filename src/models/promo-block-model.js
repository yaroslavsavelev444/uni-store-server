const mongoose = require("mongoose");

const PromoBlockSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String }, // путь к загруженному изображению
    productId: { type: String },
    link: { type: String }, // кастомная ссылка, если не productId
    reversed: { type: Boolean, default: false },
    page: { type: String, required: true }, // например: 'home', 'about', 'product'
  },
  { timestamps: true }
);

module.exports = mongoose.model("PromoBlock", PromoBlockSchema);