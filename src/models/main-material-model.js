// models/mainMaterial.model.js
import { model, Schema } from "mongoose";

const MainMaterialSchema = new Schema(
	{
		caption: { type: String, required: true },
		mediaUrl: { type: String, required: true }, // Путь к файлу
		mediaType: { type: String, enum: ["image", "video"], required: true },
	},
	{ timestamps: true },
);

export default model("MainMaterial", MainMaterialSchema);
