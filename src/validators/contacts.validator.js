import { array, boolean, number, object, string } from "joi";
import { EMAIL_REGEX, PHONE_REGEX, URL_REGEX } from "../constants/regex";

const phoneSchema = object({
  type: string()
    .valid("support", "sales", "general", "fax", "accounting", "other")
    .default("general"),
  value: string().pattern(PHONE_REGEX).required().messages({
    "string.pattern.base": "Неверный формат телефона",
  }),
  description: string().max(100),
  isPrimary: boolean().default(false),
  sortOrder: number().default(0),
});

const emailSchema = object({
  type: string()
    .valid("support", "info", "sales", "security", "hr", "other")
    .default("general"),
  value: string().pattern(EMAIL_REGEX).required().messages({
    "string.pattern.base": "Неверный формат email",
  }),
  description: string().max(100),
  isPrimary: boolean().default(false),
  sortOrder: number().default(0),
});

const socialLinkSchema = object({
  platform: string()
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
  url: string().pattern(URL_REGEX).required().messages({
    "string.pattern.base": "Неверный формат URL",
  }),
  title: string().max(100),
  sortOrder: number().default(0),
});

const otherContactSchema = object({
  type: string()
    .valid("messenger", "forum", "custom", "chat", "bot")
    .required(),
  name: string().max(100).required(),
  value: string().required(),
  description: string().max(200),
  sortOrder: number().default(0),
});

const organizationContactSchema = object({
  companyName: string().max(200).required(),
  legalAddress: string().max(500).allow(""),
  physicalAddress: string().max(500).allow(""),
  phones: array().items(phoneSchema).max(10),
  emails: array().items(emailSchema).max(10),
  socialLinks: array().items(socialLinkSchema).max(15),
  otherContacts: array().items(otherContactSchema).max(10),
  workingHours: string().max(500).allow(""),
  isActive: boolean(),
}).options({ stripUnknown: true });

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
