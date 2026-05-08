import { model, Schema } from "mongoose";
import type {
  IKeyEncrypt,
  IKeyEncryptDocument,
  IKeyEncryptMethods,
  KeyEncryptModelType,
} from "../types/keyEncrypt.types.js";

const keySchema = new Schema<
  IKeyEncrypt,
  KeyEncryptModelType,
  IKeyEncryptMethods
>(
  {
    version: { type: Number, required: true, unique: true },
    dekEncrypted: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: false },
    comment: { type: String },
  },
  { timestamps: true },
);

keySchema.index({ version: 1 });
keySchema.index({ active: 1 });

export default model<IKeyEncryptDocument, KeyEncryptModelType>(
  "KeyEncrypt",
  keySchema,
);
