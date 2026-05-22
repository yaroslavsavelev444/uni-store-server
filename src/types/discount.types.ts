import type { Document, Model, Types } from "mongoose";

export type DiscountType = "percentage" | "fixed" | "quantity_based";

export interface ICartData {
  totalAmount: number;
  totalQuantity: number;
}

// Базовые поля, сохраняемые в БД
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

// Полный документ с виртуалами и методами
export interface IDiscountDocument extends Document, IDiscount {
  // Виртуальные поля
  isCurrentlyActive: boolean;

  // Методы экземпляра
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

// Статические методы модели (если будут)
export interface DiscountModel extends Model<IDiscountDocument> {
  // например, findActive(): Promise<IDiscountDocument[]>;
}
