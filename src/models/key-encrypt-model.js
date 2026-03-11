// models/KeyModel.js
import { model, Schema } from "mongoose";

const keySchema = new Schema(
	{
		version: { type: Number, required: true, unique: true },
		// dekEncrypted: base64 of (iv + ciphertext + authTag) produced by wrapping DEK with KEK
		dekEncrypted: { type: String, required: true },
		createdAt: { type: Date, default: Date.now },
		active: { type: Boolean, default: false },
		comment: { type: String },
	},
	{ timestamps: true },
);

keySchema.index({ version: 1 });
keySchema.index({ active: 1 });

export default model("KeyEncrypt", keySchema);
