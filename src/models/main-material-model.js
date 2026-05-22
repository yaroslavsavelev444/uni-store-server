// models/mainMaterial.model.js
const mongoose = require("mongoose");

const MainMaterialSchema = new mongoose.Schema(
  {
    caption: { type: String, required: true },
    mediaUrl: { type: String, required: true }, // Путь к файлу
    mediaType: { type: String, enum: ["image", "video"], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MainMaterial", MainMaterialSchema);