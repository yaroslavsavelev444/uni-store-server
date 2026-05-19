import { model, Schema } from "mongoose";
import type {
  ITransportCompany,
  ITransportCompanyMethods,
  ITransportCompanyModel,
  TransportCompanyDocument,
} from "../types/transportCompany.types.js";

const TransportCompanySchema = new Schema<
  ITransportCompany,
  ITransportCompanyModel,
  ITransportCompanyMethods
>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export default model<ITransportCompany, ITransportCompanyModel>(
  "TransportCompany",
  TransportCompanySchema,
);
