import { model, Schema } from "mongoose";
import type {
  IPickupPoint,
  IPickupPointMethods,
  IPickupPointModel,
  PickupPointDocument,
} from "../types/pickupPoint.types.js";

const PickupPointSchema = new Schema<
  IPickupPoint,
  IPickupPointModel,
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
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
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

// Индексы
PickupPointSchema.index({ "address.city": 1, isActive: 1 });
PickupPointSchema.index({ isMain: 1, isActive: 1 });

// Pre-save: при установке isMain = true сбрасываем предыдущий основной пункт
PickupPointSchema.pre("save", async function (this: PickupPointDocument, next) {
  if (this.isMain && this.isModified("isMain")) {
    try {
      const Model = this.constructor as IPickupPointModel;
      await Model.updateMany(
        { _id: { $ne: this._id }, isMain: true },
        { isMain: false },
      );
    } catch (error) {
      return next(error as Error);
    }
  }
  next();
});

export default model<IPickupPoint, IPickupPointModel>(
  "PickupPoint",
  PickupPointSchema,
);
