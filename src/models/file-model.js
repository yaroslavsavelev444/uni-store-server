import { randomBytes } from "node:crypto";
import { model, Schema } from "mongoose";

const fileSchema = new Schema({
	userId: { type: String, required: true, index: true },
	tempName: { type: String, required: true },
	originalName: { type: String, required: true },
	mimeType: { type: String, required: true },
	size: { type: Number, required: true, min: 0 },
	uploadedAt: { type: Date, default: Date.now, index: true },
	path: { type: String, required: true },
	status: {
		type: String,
		enum: ["temp", "permanent"],
		default: "temp",
		index: true,
	},
	expiresAt: { type: Date, index: true },
	// Поля для публичного доступа
	isPublic: { type: Boolean, default: false, index: true },
	publicToken: { type: String, unique: true, sparse: true },
	// Привязка к сущности (заказ, товар и т.п.)
	entityType: {
		type: String,
		enum: ["order", "product", null],
		default: null,
		index: true,
	},
	entityId: { type: Schema.Types.ObjectId, default: null, index: true },
});

// Генерация токена перед сохранением, если файл публичный, но токена нет
fileSchema.pre("save", function (next) {
	if (this.isPublic && !this.publicToken) {
		this.publicToken = randomBytes(16).toString("hex");
	}
	next();
});

export default model("File", fileSchema);
