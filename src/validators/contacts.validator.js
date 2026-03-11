import joi from "joi";

import { EMAIL_REGEX, PHONE_REGEX, URL_REGEX } from "../constants/regex.js";

const phoneSchema = joi.object({
  type: joi
    .string()
    .valid("support", "sales", "general", "fax", "accounting", "other")
    .default("general"),
  value: joi.string().pattern(PHONE_REGEX).required().messages({
    "string.pattern.base": "Неверный формат телефона",
  }),
  description: joi.string().max(100),
  isPrimary: joi.boolean().default(false),
  sortOrder: joi.number().default(0),
});

const emailSchema = joi.object({
  type: joi
    .string()
    .valid("support", "info", "sales", "security", "hr", "other")
    .default("general"),
  value: joi.string().pattern(EMAIL_REGEX).required().messages({
    "string.pattern.base": "Неверный формат email",
  }),
  description: joi.string().max(100),
  isPrimary: joi.boolean().default(false),
  sortOrder: joi.number().default(0),
});

const socialLinkSchema = joi.object({
  platform: joi
    .string()
    .valid(
      "telegram",
      "whatsapp",
      "vk",
      "youtube",
      "linkedin",
      "github",
      "twitter",
      "facebook",
      "instagram",
      "other",
    )
    .required(),
  url: joi.string().pattern(URL_REGEX).required().messages({
    "string.pattern.base": "Неверный формат URL",
  }),
  title: joi.string().max(100),
  sortOrder: joi.number().default(0),
});

const otherContactSchema = joi.object({
  type: joi
    .string()
    .valid("messenger", "forum", "custom", "chat", "bot")
    .required(),
  name: joi.string().max(100).required(),
  value: joi.string().required(),
  description: joi.string().max(200),
  sortOrder: joi.number().default(0),
});

const organizationContactSchema = joi
  .object({
    companyName: joi.string().max(200).required(),
    legalAddress: joi.string().max(500).allow(""),
    physicalAddress: joi.string().max(500).allow(""),
    phones: joi.array().items(phoneSchema).max(10),
    emails: joi.array().items(emailSchema).max(10),
    socialLinks: joi.array().items(socialLinkSchema).max(15),
    otherContacts: joi.array().items(otherContactSchema).max(10),
    workingHours: joi.string().max(500).allow(""),
    isActive: joi.boolean(),
  })
  .options({ stripUnknown: true });

export function validateCreateUpdate(req, res, next) {
  console.log("validateCreateUpdate", req.body);

  const { error, value } = organizationContactSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    return res.status(400).json({
      success: false,
      message: "Ошибка валидации",
      errors,
    });
  }

  req.body = value;
  next();
}
