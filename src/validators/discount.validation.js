import { boolean, date, number, object, ref, string, valid, when } from "joi";

const createDiscountValidation = object({
  name: string().required().min(2).max(100),
  description: string().max(500).optional(),
  type: string()
    .valid("quantity_based", "amount_based", "percentage_based")
    .default("quantity_based"),
  discountPercent: number().required().min(0).max(100),
  minTotalQuantity: when("type", {
    is: "quantity_based",
    then: number().required().min(1),
    otherwise: number().min(1).optional(),
  }),
  minOrderAmount: number().min(0).optional(),
  maxDiscountAmount: number().min(0).optional(),
  isActive: boolean().default(true),
  isUnlimited: boolean().default(false),
  startAt: date().optional(),
  endAt: when("isUnlimited", {
    is: false,
    then: date().greater(ref("startAt")).optional(),
    otherwise: valid(null).optional(),
  }),
  priority: number().min(1).max(10).default(1),
  code: string().uppercase().trim().max(20).optional(),
});

const updateDiscountValidation = object({
  name: string().min(2).max(100).optional(),
  description: string().max(500).optional(),
  type: string()
    .valid("quantity_based", "amount_based", "percentage_based")
    .optional(),
  discountPercent: number().min(0).max(100).optional(),
  minTotalQuantity: number().min(1).optional(),
  minOrderAmount: number().min(0).optional(),
  maxDiscountAmount: number().min(0).optional(),
  isActive: boolean().optional(),
  isUnlimited: boolean().optional(),
  startAt: date().optional(),
  endAt: date().optional(),
  priority: number().min(1).max(10).optional(),
  code: string().uppercase().trim().max(20).optional(),
}).min(1); // Хотя бы одно поле должно быть

export default {
  createDiscountValidation,
  updateDiscountValidation,
};
