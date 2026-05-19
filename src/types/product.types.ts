import type { HydratedDocument, Model, Types } from "mongoose";

// Статусы товара
export const ProductStatus = {
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  PREORDER: "preorder",
  ARCHIVED: "archived",
} as const;

export type ProductStatusType =
  (typeof ProductStatus)[keyof typeof ProductStatus];

// === Вложенные структуры ===
export interface IDiscount {
  isActive?: boolean;
  percentage?: number;
  amount?: number;
  validFrom?: Date;
  validUntil?: Date;
  minQuantity?: number;
}

export interface IProductImage {
  url: string;
  alt?: string;
  order?: number;
}

export interface IInstruction {
  type?: "file" | "link";
  url?: string;
  originalName?: string;
  size?: number;
  title?: string;
  alt?: string;
  mimetype?: string;
}

export interface ISpecification {
  name: string;
  value: any; // Schema.Types.Mixed
  unit?: string;
  group?: string;
  isVisible?: boolean;
}

export interface IDimensions {
  length?: number;
  width?: number;
  height?: number;
}

// === Базовые поля, сохраняемые в БД (без виртуалов) ===
export interface IProduct {
  _id: Types.ObjectId;
  sku: string;
  title: string;
  description: string;
  priceForIndividual: number;
  discount?: IDiscount;
  status: ProductStatusType;
  minOrderQuantity: number;
  maxOrderQuantity?: number;
  category: Types.ObjectId;
  isVisible: boolean;
  showOnMainPage: boolean;
  mainImage?: string;
  images?: IProductImage[];
  instruction?: IInstruction;
  specifications?: ISpecification[];
  customAttributes?: Record<string, any>;
  relatedProducts?: Types.ObjectId[];
  upsellProducts?: Types.ObjectId[];
  crossSellProducts?: Types.ObjectId[];
  weight?: number;
  dimensions?: IDimensions;
  manufacturer?: string;
  warrantyMonths?: number;
  rating?: number;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  publishedAt?: Date;
  viewsCount: number;
  purchasesCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра ===
export interface IProductMethods {
  incrementViews(): Promise<ProductDocument>;
  incrementPurchases(quantity?: number): Promise<ProductDocument>;
  getProductUrl(): string;
  toJSON(): any;
}

// === Статические методы модели ===
export interface IProductModel extends Model<IProduct, {}, IProductMethods> {
  findAvailable(): Promise<ProductDocument[]>;
  findWithUrls(...args: any[]): Promise<ProductDocument[]>;
  findOneWithUrl(...args: any[]): Promise<ProductDocument | null>;
  findWithProcessedUrls(...args: any[]): Promise<ProductDocument[]>;
  findOneWithProcessedUrls(...args: any[]): Promise<ProductDocument | null>;
  findByIdWithProcessedUrls(
    id: Types.ObjectId | string,
    ...args: any[]
  ): Promise<ProductDocument | null>;
}

// === Тип документа с методами ===
export type ProductDocument = HydratedDocument<IProduct, IProductMethods>;
