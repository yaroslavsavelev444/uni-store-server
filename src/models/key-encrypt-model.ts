import { model, Schema } from "mongoose";
import type {
  IKeyEncrypt,
  IKeyEncryptMethods,
  IKeyEncryptModel,
} from "../types/keyEncrypt.types.js";

const keySchema = new Schema<IKeyEncrypt, IKeyEncryptModel, IKeyEncryptMethods>(
  {
    version: { type: Number, required: true, unique: true },
    dekEncrypted: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: false },
    comment: { type: String },
  },
  { timestamps: true },
);

// Индексы
keySchema.index({ version: 1 });
keySchema.index({ active: 1 });

// Экспорт модели
export default model<IKeyEncrypt, IKeyEncryptModel>("KeyEncrypt", keySchema);
