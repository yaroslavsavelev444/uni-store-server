/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import {
  type FilterQuery,
  model,
  type ProjectionType,
  type QueryOptions,
  Schema,
  Types,
} from "mongoose";
import {
  type IProduct,
  type IProductMethods,
  type IProductModel,
  type ProductDocument,
  ProductStatus,
} from "../types/product.types.js";
import fileService from "../utils/fileManager.js";

const ProductStatusValues = Object.values(ProductStatus);

const processProductDocument = (doc: any) => {
  if (!doc || typeof doc !== "object") return doc;
  // Обработка instruction для ссылки
  else if (
    doc.instruction &&
    doc.instruction.type === "link" &&
    doc.instruction.link
  ) {
    doc.instruction = {
      type: "link",
      url: doc.instruction.link,
      link: doc.instruction.link,
    };
  }

  return doc;
};

// ========== СХЕМА ==========
const ProductSchema = new Schema<IProduct, IProductModel, IProductMethods>(
  {
    sku: {
      type: String,
      unique: true,
      required: [true, "SKU обязателен"],
      trim: true,
      index: true,
      validate: {
        validator: (v: string) => /^[a-zA-Z0-9_-]+$/.test(v),
        message:
          "SKU может содержать только буквы, цифры, дефисы и подчеркивания",
      },
    },
    title: {
      type: String,
      required: [true, "Название обязательно"],
      trim: true,
      minlength: [3, "Название должно содержать минимум 3 символа"],
      maxlength: [200, "Название должно содержать максимум 200 символов"],
    },
    description: {
      type: String,
      required: [true, "Описание обязательно"],
      minlength: [10, "Описание должно содержать минимум 10 символов"],
      maxlength: [5000, "Описание должно содержать максимум 5000 символов"],
    },
    priceForIndividual: {
      type: Number,
      required: [true, "Цена для физ. лиц обязательна"],
      min: [0, "Цена не может быть отрицательной"],
      max: [100000000, "Цена не может превышать 100 000 000"],
    },
    discount: {
      isActive: { type: Boolean, default: false },
      percentage: { type: Number, default: 0, min: 0, max: 100 },
      amount: { type: Number, default: 0, min: 0 },
      validFrom: Date,
      validUntil: Date,
      minQuantity: { type: Number, default: 1, min: 1 },
    },
    status: {
      type: String,
      enum: ProductStatusValues,
      default: ProductStatus.AVAILABLE,
    },
    minOrderQuantity: {
      type: Number,
      default: 1,
      min: [1, "Минимальное количество заказа не может быть меньше 1"],
      max: [1000, "Минимальное количество заказа не может превышать 1000"],
    },
    maxOrderQuantity: {
      type: Number,
      min: [1, "Максимальное количество заказа не может быть меньше 1"],
      max: [10000, "Максимальное количество заказа не может превышать 10000"],
      validate: {
        validator: function (this: IProduct, v: number) {
          return !v || v >= this.minOrderQuantity;
        },
        message:
          "Максимальное количество должно быть больше или равно минимальному",
      },
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    isVisible: { type: Boolean, default: true, index: true },
    showOnMainPage: { type: Boolean, default: false, index: true },

    // images – массив ссылок на File
    images: {
      type: [String],
      ref: "File",
      default: [],
    },
    // instruction – упрощённая структура
    instruction: {
      type: {
        type: String,
        enum: ["file", "link"],
      },
      file: {
        type: Schema.Types.ObjectId,
        ref: "File",
        default: null,
      },
      link: {
        type: String,
        validate: {
          validator: (v: string) => !v || /^https?:\/\//.test(v),
          message: "Неверный формат ссылки",
        },
      },
    },

    specifications: [
      {
        name: { type: String, required: true, maxlength: 100 },
        value: { type: Schema.Types.Mixed, required: true },
        unit: { type: String, maxlength: 20 },
        group: { type: String, maxlength: 50 },
        isVisible: { type: Boolean, default: true },
      },
    ],
    customAttributes: { type: Schema.Types.Mixed, default: {} },
    relatedProducts: [{ type: Types.ObjectId, ref: "Product" }],
    upsellProducts: [{ type: Types.ObjectId, ref: "Product" }],
    crossSellProducts: [{ type: Types.ObjectId, ref: "Product" }],
    weight: { type: Number, min: 0, max: 100000 },
    dimensions: {
      length: { type: Number, min: 0, max: 10000 },
      width: { type: Number, min: 0, max: 10000 },
      height: { type: Number, min: 0, max: 10000 },
    },
    manufacturer: { type: String, maxlength: 100 },
    warrantyMonths: { type: Number, min: 0, max: 120 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    metaTitle: { type: String, maxlength: 255 },
    metaDescription: { type: String, maxlength: 500 },
    keywords: [{ type: String, maxlength: 50 }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: Date,
    viewsCount: { type: Number, default: 0, min: 0 },
    purchasesCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete (ret as any).__v;
        delete ret.updatedAt;
        return ret;
      },
    },
  },
);

// ========== ВИРТУАЛЬНЫЕ ПОЛЯ ==========
ProductSchema.virtual("finalPriceForIndividual").get(function (
  this: ProductDocument,
) {
  if (!this.discount?.isActive) return this.priceForIndividual;
  const now = new Date();
  if (this.discount.validFrom && now < this.discount.validFrom)
    return this.priceForIndividual;
  if (this.discount.validUntil && now > this.discount.validUntil)
    return this.priceForIndividual;
  let finalPrice = this.priceForIndividual;
  if (this.discount.percentage && this.discount.percentage > 0) {
    finalPrice = finalPrice * (1 - this.discount.percentage / 100);
  }
  if (this.discount.amount && this.discount.amount > 0) {
    finalPrice = Math.max(0, finalPrice - this.discount.amount);
  }
  return Math.round(finalPrice * 100) / 100;
});

// ========== PRE‑ХУКИ (автоматический populate) ==========
ProductSchema.pre(/^find/, function (this: any, next) {
  // Populate category
  const hasCategoryPopulate =
    this._mongooseOptions.populate &&
    (Array.isArray(this._mongooseOptions.populate)
      ? this._mongooseOptions.populate.some((p: any) => p.path === "category")
      : this._mongooseOptions.populate.path === "category");
  if (!hasCategoryPopulate) {
    this.populate({
      path: "category",
      select: "slug name _id",
      options: { lean: true, strictPopulate: false },
    });
  }

  // Populate images
  const hasImagesPopulate =
    this._mongooseOptions.populate &&
    (Array.isArray(this._mongooseOptions.populate)
      ? this._mongooseOptions.populate.some((p: any) => p.path === "images")
      : this._mongooseOptions.populate.path === "images");
  if (!hasImagesPopulate) {
    this.populate({
      path: "images",
      select: "url originalName mimetype size",
      options: { lean: true, strictPopulate: false },
    });
  }

  // Populate instruction.file (только если instruction существует)
  const hasInstructionFilePopulate =
    this._mongooseOptions.populate &&
    (Array.isArray(this._mongooseOptions.populate)
      ? this._mongooseOptions.populate.some(
          (p: any) => p.path === "instruction.file",
        )
      : this._mongooseOptions.populate.path === "instruction.file");
  if (!hasInstructionFilePopulate) {
    this.populate({
      path: "instruction.file",
      select: "url originalName mimetype size",
      options: { lean: true, strictPopulate: false },
    });
  }

  next();
});

ProductSchema.pre("aggregate", function (this: any, next) {
  const pipeline = this.pipeline();

  // Category lookup
  const hasCategoryLookup = pipeline.some(
    (stage: any) => stage.$lookup && stage.$lookup.as === "category",
  );
  if (!hasCategoryLookup) {
    pipeline.unshift(
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
          pipeline: [{ $project: { slug: 1, name: 1, _id: 1 } }],
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    );
  }

  // Images lookup
  const hasImagesLookup = pipeline.some(
    (stage: any) => stage.$lookup && stage.$lookup.as === "images",
  );
  if (!hasImagesLookup) {
    pipeline.unshift({
      $lookup: {
        from: "files",
        localField: "images",
        foreignField: "_id",
        as: "images",
        pipeline: [
          { $project: { url: 1, originalName: 1, mimetype: 1, size: 1 } },
        ],
      },
    });
  }

  // Instruction.file lookup
  const hasInstructionFileLookup = pipeline.some(
    (stage: any) => stage.$lookup && stage.$lookup.as === "instruction.file",
  );
  if (!hasInstructionFileLookup) {
    const lookupStage = {
      $lookup: {
        from: "files",
        localField: "instruction.file",
        foreignField: "_id",
        as: "instruction.file",
        pipeline: [
          { $project: { url: 1, originalName: 1, mimetype: 1, size: 1 } },
        ],
      },
    };
    const unwindStage = {
      $unwind: { path: "$instruction.file", preserveNullAndEmptyArrays: true },
    };
    pipeline.unshift(unwindStage);
    pipeline.unshift(lookupStage);
  }

  next();
});

ProductSchema.pre("save", function (this: ProductDocument, next) {
  if (this.isModified("isVisible") && this.isVisible && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// ========== POST‑ХУКИ (обработка URL) ==========
//@ts-expect-error
ProductSchema.post(["find", "findOne", "findById"], (docs: any) => {
  if (!docs) return docs;
  if (Array.isArray(docs)) return docs.map(processProductDocument);
  return processProductDocument(docs);
});

ProductSchema.post("aggregate", (docs: any) => {
  if (!docs || !Array.isArray(docs)) return docs;
  return docs.map(processProductDocument);
});

// ========== МЕТОДЫ ЭКЗЕМПЛЯРА ==========
ProductSchema.methods.incrementViews = async function (this: ProductDocument) {
  this.viewsCount += 1;
  return this.save();
};

ProductSchema.methods.incrementPurchases = async function (
  this: ProductDocument,
  quantity = 1,
) {
  this.purchasesCount += quantity;
  return this.save();
};

ProductSchema.methods.toJSON = function (this: ProductDocument) {
  const obj = this.toObject();
  return processProductDocument(obj);
};

// ========== СТАТИЧЕСКИЕ МЕТОДЫ ==========
ProductSchema.statics.findAvailable = function () {
  return this.find({
    status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
    isVisible: true,
  });
};

// ========== ЭКСПОРТ ==========
export default model<IProduct, IProductModel>("Product", ProductSchema);
export { ProductStatus };
