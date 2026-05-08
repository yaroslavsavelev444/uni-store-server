import type { Document, Model, Types } from "mongoose";

export type DiscountType = "percentage" | "fixed" | "quantity_based";

export interface ICartData {
  totalAmount: number;
  totalQuantity: number;
}

export interface IDiscount {
  name: string;
  description?: string;
  type: DiscountType;
  discountPercent: number;
  fixedAmount?: number;
  minTotalQuantity?: number;
  minTotalAmount?: number;
  appliesToAllProducts: boolean;
  applicableCategories: Types.ObjectId[];
  applicableProducts: Types.ObjectId[];
  isActive: boolean;
  isUnlimited: boolean;
  startAt: Date;
  endAt: Date | null;
  priority: number;
  code?: string;
  totalUses: number;
  totalDiscountAmount: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDiscountVirtuals {
  isCurrentlyActive: boolean;
}

export interface IDiscountMethods {
  calculateDiscount(cartData: ICartData): {
    applicable: boolean;
    discountAmount: number;
    discountPercent?: number;
    message: string;
    needed?: { quantity?: number; amount?: number };
    current?: { quantity?: number; amount?: number };
  };
  isApplicableToProduct(
    product:
      | Types.ObjectId
      | { _id: Types.ObjectId; category?: Types.ObjectId },
  ): boolean;
  getQuantityWord(quantity: number): string;
  formatPrice(amount: number): string;
}

export interface DiscountModelType extends Model<
  IDiscountDocument,
  {},
  IDiscountMethods
> {
  // статические методы (если будут)
}

export type IDiscountDocument = Document<unknown, {}, IDiscount> &
  IDiscount &
  IDiscountVirtuals &
  IDiscountMethods;
