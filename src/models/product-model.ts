import { model, Schema, Types } from "mongoose";
import {
  HydratedProduct,
  type IProduct,
  type IProductMethods,
  type ProductModelType,
  ProductStatus,
} from "../types/product.types.js";
import fileService from "../utils/fileManager.js";

const ProductStatusValues = Object.values(ProductStatus);

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
const shouldProcessUrl = (url: unknown): url is string => {
  if (typeof url !== "string") return false;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  )
    return false;
  return url.startsWith("/uploads/");
};

const generateAndAddUrl = (productObj: any) => {
  if (!productObj.sku) return;
  let categorySlug = "";
  if (productObj.category) {
    if (typeof productObj.category === "object" && productObj.category.slug) {
      categorySlug = productObj.category.slug;
    }
  }
  if (categorySlug) {
    const BASE_URL = "https://npo-polet.ru";
    productObj.url = `${BASE_URL}/categories/${categorySlug}/products/${productObj.sku}`;
    productObj.productUrl = `/categories/${categorySlug}/products/${productObj.sku}`;
  } else {
    productObj.url = null;
  }
};

const processProductDocument = (doc: any) => {
  if (!doc || typeof doc !== "object") return doc;

  if (doc.mainImage && shouldProcessUrl(doc.mainImage)) {
    doc.mainImage = fileService.getFileUrl(doc.mainImage);
  }
  if (doc.images && Array.isArray(doc.images)) {
    doc.images = doc.images.map((image: any) => {
      if (image?.url && shouldProcessUrl(image.url)) {
        return { ...image, url: fileService.getFileUrl(image.url) };
      }
      return image;
    });
  }
  if (doc.instruction?.url && shouldProcessUrl(doc.instruction.url)) {
    doc.instruction = {
      ...doc.instruction,
      url: fileService.getFileUrl(doc.instruction.url),
    };
  }
  if (doc.specifications && Array.isArray(doc.specifications)) {
    doc.specifications = doc.specifications.map((spec: any) => {
      if (
        spec.value &&
        typeof spec.value === "string" &&
        shouldProcessUrl(spec.value)
      ) {
        return { ...spec, value: fileService.getFileUrl(spec.value) };
      }
      return spec;
    });
  }
  if (doc.sku) {
    if (
      !doc.url &&
      doc.category &&
      typeof doc.category === "object" &&
      doc.category.slug
    ) {
      const BASE_URL = "https://npo-polet.ru";
      doc.url = `${BASE_URL}/categories/${doc.category.slug}/products/${doc.sku}`;
    } else if (!doc.url && doc.category && doc.sku) {
      doc.url = null;
    }
  }
  return doc;
};

// ========== СХЕМА ==========
const ProductSchema = new Schema<IProduct, ProductModelType, IProductMethods>(
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
      max: [100000000, "Цена не может превышать 1 000 000 00"],
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
    mainImage: {
      type: String,
      validate: {
        validator: (v: string) =>
          !v || /^(\/uploads\/products\/images\/|https?:\/\/)/.test(v),
        message: "Некорректный формат основного изображения",
      },
    },
    images: [
      {
        url: {
          type: String,
          required: true,
          validate: {
            validator: (v: string) =>
              /^(\/uploads\/products\/images\/|https?:\/\/)/.test(v),
            message: "Некорректный формат изображения",
          },
        },
        alt: { type: String, maxlength: 255 },
        order: { type: Number, default: 0, min: 0 },
      },
    ],
    instruction: {
      type: {
        type: String,
        enum: ["file", "link"],
      },
      url: {
        type: String,
        validate: {
          validator: function (this: IProduct, v: string) {
            if (!this.instruction?.type) return true;
            if (this.instruction.type === "file") {
              return /^(\/uploads\/products\/instructions\/|https?:\/\/)/.test(
                v,
              );
            } else if (this.instruction.type === "link") {
              try {
                new URL(v);
                return true;
              } catch {
                return false;
              }
            }
            return true;
          },
          message: function (this: IProduct) {
            const instructionType = this.instruction?.type;
            if (instructionType === "file")
              return "Некорректный формат файла инструкции";
            if (instructionType === "link") return "Некорректный формат ссылки";
            return "Некорректный формат инструкции";
          },
        },
      },
      originalName: { type: String, maxlength: 255 },
      size: { type: Number, min: 0, max: 50 * 1024 * 1024 },
      title: { type: String, maxlength: 255 },
      alt: { type: String, maxlength: 255 },
      mimetype: { type: String },
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
        delete ret.__v;
        delete ret.updatedAt;
        if (ret.sku) generateAndAddUrl(ret);
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        if (ret.sku) generateAndAddUrl(ret);
        return ret;
      },
    },
  },
);

// ========== ВИРТУАЛЬНЫЕ ПОЛЯ ==========
ProductSchema.virtual("finalPriceForIndividual").get(function (this: IProduct) {
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

ProductSchema.virtual("url").get(function (this: IProduct) {
  if (
    this.category &&
    typeof this.category === "object" &&
    (this.category as any).slug &&
    this.sku
  ) {
    const BASE_URL = "https://npo-polet.ru";
    return `${BASE_URL}/categories/${(this.category as any).slug}/products/${this.sku}`;
  }
  return null;
});

// ========== PRE‑ХУКИ ==========
ProductSchema.pre(/^find/, function (this: any, next) {
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
  next();
});

ProductSchema.pre("aggregate", function (this: any, next) {
  const hasCategoryLookup = this.pipeline().some(
    (stage: any) => stage.$lookup && stage.$lookup.as === "category",
  );
  if (!hasCategoryLookup) {
    this.pipeline().unshift(
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
  next();
});

ProductSchema.pre("save", function (this: IProduct, next) {
  if (this.isModified("isVisible") && this.isVisible && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// ========== POST‑ХУКИ ==========
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
ProductSchema.methods.incrementViews = async function (this: any) {
  this.viewsCount += 1;
  return this.save();
};

ProductSchema.methods.incrementPurchases = async function (
  this: any,
  quantity = 1,
) {
  this.purchasesCount += quantity;
  return this.save();
};

ProductSchema.methods.getProductUrl = function (this: any): string {
  if (
    this.category &&
    typeof this.category === "object" &&
    this.category.slug
  ) {
    const BASE_URL = "https://npo-polet.ru";
    return `${BASE_URL}/categories/${this.category.slug}/products/${this.sku}`;
  }
  return `/categories/[category]/products/${this.sku}`;
};

ProductSchema.methods.toJSON = function () {
  const obj = this.toObject ? this.toObject() : this;
  return processProductDocument(obj);
};

// ========== СТАТИЧЕСКИЕ МЕТОДЫ ==========
ProductSchema.statics.findAvailable = function (this: ProductModelType) {
  return this.find({
    status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
    isVisible: true,
  });
};

ProductSchema.statics.findWithUrls = function (
  this: ProductModelType,
  ...args: any[]
) {
  return this.find(...args)
    .populate({
      path: "category",
      select: "slug name _id",
      options: { lean: true, strictPopulate: false },
    })
    .lean({ virtuals: true });
};

ProductSchema.statics.findOneWithUrl = function (
  this: ProductModelType,
  ...args: any[]
) {
  return this.findOne(...args)
    .populate({
      path: "category",
      select: "slug name _id",
      options: { lean: true, strictPopulate: false },
    })
    .lean({ virtuals: true });
};

ProductSchema.statics.findWithProcessedUrls = async function (
  this: ProductModelType,
  ...args: any[]
) {
  const docs = await this.find(...args);
  return Array.isArray(docs)
    ? docs.map(processProductDocument)
    : processProductDocument(docs);
};

ProductSchema.statics.findOneWithProcessedUrls = async function (
  this: ProductModelType,
  ...args: any[]
) {
  const doc = await this.findOne(...args);
  return processProductDocument(doc);
};

ProductSchema.statics.findByIdWithProcessedUrls = async function (
  this: ProductModelType,
  id: Types.ObjectId | string,
  ...args: any[]
) {
  const doc = await this.findById(id, ...args);
  return processProductDocument(doc);
};

// ========== ЭКСПОРТ ==========
export default model<IProduct, ProductModelType>("Product", ProductSchema);
export { ProductStatus };
