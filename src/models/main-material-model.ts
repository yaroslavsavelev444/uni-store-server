import { model, Schema } from "mongoose";
import type {
  IMainMaterial,
  IMainMaterialDocument,
  IMainMaterialMethods,
  MainMaterialModelType,
} from "../types/mainMaterial.types.js";

const MainMaterialSchema = new Schema<
  IMainMaterial,
  MainMaterialModelType,
  IMainMaterialMethods
>(
  {
    caption: { type: String, required: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ["image", "video"], required: true },
  },
  { timestamps: true },
);

export default model<IMainMaterialDocument, MainMaterialModelType>(
  "MainMaterial",
  MainMaterialSchema,
);
