import { model, Schema } from "mongoose";
import type {
  IPickupPoint,
  IPickupPointDocument,
  IPickupPointMethods,
  PickupPointModelType,
} from "../types/pickupPoint.types.js";

const PickupPointSchema = new Schema<
  IPickupPoint,
  PickupPointModelType,
  IPickupPointMethods
>(
  {
    name: { type: String, required: true, trim: true },
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, default: "Россия", trim: true },
    },
    coordinates: { lat: Number, lng: Number },
    workingHours: { type: String, default: "Пн-Пт: 9:00-18:00" },
    contact: { phone: String, email: String },
    description: String,
    isActive: { type: Boolean, default: true, index: true },
    isMain: { type: Boolean, default: false, index: true },
    orderIndex: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

PickupPointSchema.index({ "address.city": 1, isActive: 1 });
PickupPointSchema.index({ isMain: 1, isActive: 1 });

PickupPointSchema.pre(
  "save",
  async function (this: IPickupPointDocument, next) {
    if (this.isMain && this.isModified("isMain")) {
      try {
        const Model = this.constructor as PickupPointModelType;
        await Model.updateMany(
          { _id: { $ne: this._id }, isMain: true },
          { isMain: false },
        );
      } catch (error) {
        return next(error as Error);
      }
    }
    next();
  },
);

export default model<IPickupPointDocument, PickupPointModelType>(
  "PickupPoint",
  PickupPointSchema,
);
