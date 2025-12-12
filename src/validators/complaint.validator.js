const Joi = require("joi");

// Список допустимых категорий (только значения)
const allowedCategories = [
  "info_mismatch",
  "ownership_violation",
  "fraud",
  "copyright",
  "illegal_content",
  "unlabeled_ad",
  "spam",
  "abuse",
  "rules_violation",
  "user",
  "auth_issue",
  "payment_issue",
  "support_issue",
  "service_unavailable",
  "technical",
  "moderation_issue",
  "other",
];

// === USER ===
const createComplaintSchema = Joi.object({
  description: Joi.string().trim().min(1).required(),
  categories: Joi.array()
    .items(Joi.string().valid(...allowedCategories))
    .min(1)
    .required()
    .messages({
      "array.min": "Не выбрана ни одна категория",
      "any.only": "Передана недопустимая категория",
    }),
  otherText: Joi.when("categories", {
    is: Joi.array().items(Joi.string().valid(...allowedCategories)).has("other"),
    then: Joi.string().trim().min(1).required().messages({
      "any.required": "Укажите вашу причину для категории 'Другое'",
      "string.empty": "Укажите вашу причину для категории 'Другое'",
    }),
    otherwise: Joi.string().trim().allow("", null),
  }),
  files: Joi.array().items(
    Joi.object({
      tempName: Joi.string().required(),
      url: Joi.string().required(),
    })
  ).optional(),
});

const updateComplaintSchema = Joi.object({
  description: Joi.string().trim().min(1).optional(),
  categories: Joi.array()
    .items(Joi.string().valid(...allowedCategories))
    .min(1)
    .optional(),
  otherText: Joi.string().trim().allow("", null),
  files: Joi.array().items(
    Joi.object({
      tempName: Joi.string().required(),
      url: Joi.string().required(),
    })
  ).optional(),
});

// === ADMIN ===
const changeComplaintStatusSchema = Joi.object({
  status: Joi.string()
    .valid("pending", "in_progress", "resolved", "rejected")
    .required(),
  adminComment: Joi.string().allow("").optional(),
});

module.exports = {
  createComplaintSchema,
  updateComplaintSchema,
  changeComplaintStatusSchema,
};