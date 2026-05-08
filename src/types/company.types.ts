import { model, Schema } from "mongoose";
import type {
  CompanyModelType,
  ICompany,
  ICompanyDocument,
} from "../types/company.types.js";

const companySchema = new Schema<ICompany, CompanyModelType, ICompanyMethods>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    legalAddress: {
      type: String,
      required: true,
      trim: true,
    },
    companyAddress: {
      type: String,
      trim: true,
    },
    taxNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Уникальный индекс по taxNumber + user
companySchema.index({ taxNumber: 1, user: 1 }, { unique: true });

// Текстовый индекс для поиска
companySchema.index({ companyName: "text", taxNumber: "text" });

// Middleware для очистки taxNumber от пробелов
companySchema.pre("save", function (this: ICompanyDocument, next) {
  if (this.taxNumber) {
    this.taxNumber = this.taxNumber.replace(/\s/g, "");
  }
  next();
});

// Виртуальное поле ordersCount
companySchema.virtual("ordersCount", {
  ref: "Order",
  localField: "_id",
  foreignField: "companyInfo.companyId",
  count: true,
});

// Виртуальное поле lastOrder
companySchema.virtual("lastOrder", {
  ref: "Order",
  localField: "_id",
  foreignField: "companyInfo.companyId",
  justOne: true,
  options: { sort: { createdAt: -1 } },
});

export default model<ICompanyDocument, CompanyModelType>(
  "Company",
  companySchema,
);
