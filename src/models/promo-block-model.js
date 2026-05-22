const mongoose = require("mongoose");

const PromoBlockSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String }, 
    link: { type: String }, 
    reversed: { type: Boolean, default: false },
    page: { type: String, required: true }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("PromoBlock", PromoBlockSchema);