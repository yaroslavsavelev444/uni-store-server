import type { HydratedDocument, Model, PopulatedDoc, Types } from "mongoose";
import type { FileDocument, IFile } from "./file.types.js";

export const ProductStatus = {
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  PREORDER: "preorder",
  ARCHIVED: "archived",
} as const;
export type ProductStatusType =
  (typeof ProductStatus)[keyof typeof ProductStatus];

export interface IDiscount {
  isActive?: boolean;
  percentage?: number;
  amount?: number;
  validFrom?: Date;
  validUntil?: Date;
  minQuantity?: number;
}

// Новая структура инструкции — без лишних полей
export interface IInstruction {
  type: "file" | "link";
  file?: Types.ObjectId | FileDocument | null;
  link?: string;
}

export interface ISpecification {
  name: string;
  value: any;
  unit?: string;
  group?: string;
  isVisible?: boolean;
}

export interface IDimensions {
  length?: number;
  width?: number;
  height?: number;
}

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
  // mainImage удалён
  images?: string[] | PopulatedDoc<IFile>[] | null; // теперь может быть populate
  instruction?: string | PopulatedDoc<IFile> | null; // теперь может быть populate
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

export interface IProductMethods {
  incrementViews(): Promise<ProductDocument>;
  incrementPurchases(quantity?: number): Promise<ProductDocument>;
  getProductUrl(): string;
  toJSON(): any;
}

export interface IProductModel extends Model<IProduct, {}, IProductMethods> {
  findAvailable(): Promise<ProductDocument[]>;
  findOneWithUrl(...args: any[]): Promise<ProductDocument | null>;
  findWithProcessedUrls(...args: any[]): Promise<ProductDocument[]>;
  findOneWithProcessedUrls(...args: any[]): Promise<ProductDocument | null>;
  findByIdWithProcessedUrls(
    id: Types.ObjectId | string,
    ...args: any[]
  ): Promise<ProductDocument | null>;
}

export type ProductDocument = HydratedDocument<IProduct, IProductMethods>;
