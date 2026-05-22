const Joi = require("joi");

const createDiscountValidation = Joi.object({
  name: Joi.string().required().min(2).max(100),
  description: Joi.string().max(500).optional(),
  type: Joi.string().valid("quantity_based", "amount_based", "percentage_based").default("quantity_based"),
  discountPercent: Joi.number().required().min(0).max(100),
  minTotalQuantity: Joi.when("type", {
    is: "quantity_based",
    then: Joi.number().required().min(1),
    otherwise: Joi.number().min(1).optional()
  }),
  minOrderAmount: Joi.number().min(0).optional(),
  maxDiscountAmount: Joi.number().min(0).optional(),
  isActive: Joi.boolean().default(true),
  isUnlimited: Joi.boolean().default(false),
  startAt: Joi.date().optional(),
  endAt: Joi.when("isUnlimited", {
    is: false,
    then: Joi.date().greater(Joi.ref("startAt")).optional(),
    otherwise: Joi.valid(null).optional()
  }),
  priority: Joi.number().min(1).max(10).default(1),
  code: Joi.string().uppercase().trim().max(20).optional()
});

const updateDiscountValidation = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().max(500).optional(),
  type: Joi.string().valid("quantity_based", "amount_based", "percentage_based").optional(),
  discountPercent: Joi.number().min(0).max(100).optional(),
  minTotalQuantity: Joi.number().min(1).optional(),
  minOrderAmount: Joi.number().min(0).optional(),
  maxDiscountAmount: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
  isUnlimited: Joi.boolean().optional(),
  startAt: Joi.date().optional(),
  endAt: Joi.date().optional(),
  priority: Joi.number().min(1).max(10).optional(),
  code: Joi.string().uppercase().trim().max(20).optional()
}).min(1); // Хотя бы одно поле должно быть

module.exports = {
  createDiscountValidation,
  updateDiscountValidation
};