import { model, Schema, type Types } from "mongoose";
import type {
  CompanyDocument,
  ICompany,
  ICompanyMethods,
  ICompanyModel,
} from "../types/company.types.js";

const companySchema = new Schema<ICompany, ICompanyModel, ICompanyMethods>(
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

// Уникальный индекс для ИНН + пользователь
companySchema.index({ taxNumber: 1, user: 1 }, { unique: true });

// Текстовый индекс для поиска
companySchema.index({ companyName: "text", taxNumber: "text" });

// Pre-save middleware: очистка ИНН от пробелов
companySchema.pre("save", function (this: CompanyDocument, next) {
  if (this.taxNumber) {
    this.taxNumber = this.taxNumber.replace(/\s/g, "");
  }
  next();
});

// Виртуальное поле ordersCount – не дублируется в ICompany
companySchema.virtual("ordersCount", {
  ref: "Order",
  localField: "_id",
  foreignField: "companyInfo.companyId",
  count: true,
});

// Виртуальное поле lastOrder – не дублируется в ICompany
companySchema.virtual("lastOrder", {
  ref: "Order",
  localField: "_id",
  foreignField: "companyInfo.companyId",
  justOne: true,
  options: { sort: { createdAt: -1 } },
});

// Экспорт модели
export default model<ICompany, ICompanyModel>("Company", companySchema);
