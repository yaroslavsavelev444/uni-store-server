import { array, object, string, when } from "joi";

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
const createComplaintSchema = object({
  description: string().trim().min(1).required(),
  categories: array()
    .items(string().valid(...allowedCategories))
    .min(1)
    .required()
    .messages({
      "array.min": "Не выбрана ни одна категория",
      "any.only": "Передана недопустимая категория",
    }),
  otherText: when("categories", {
    is: array()
      .items(string().valid(...allowedCategories))
      .has("other"),
    then: string().trim().min(1).required().messages({
      "any.required": "Укажите вашу причину для категории 'Другое'",
      "string.empty": "Укажите вашу причину для категории 'Другое'",
    }),
    otherwise: string().trim().allow("", null),
  }),
  files: array()
    .items(
      object({
        tempName: string().required(),
        url: string().required(),
      }),
    )
    .optional(),
});

const updateComplaintSchema = object({
  description: string().trim().min(1).optional(),
  categories: array()
    .items(string().valid(...allowedCategories))
    .min(1)
    .optional(),
  otherText: string().trim().allow("", null),
  files: array()
    .items(
      object({
        tempName: string().required(),
        url: string().required(),
      }),
    )
    .optional(),
});

// === ADMIN ===
const changeComplaintStatusSchema = object({
  status: string()
    .valid("pending", "in_progress", "resolved", "rejected")
    .required(),
  adminComment: string().allow("").optional(),
});

export default {
  createComplaintSchema,
  updateComplaintSchema,
  changeComplaintStatusSchema,
};
