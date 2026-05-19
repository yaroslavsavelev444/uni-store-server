import type { NextFunction, Request, Response } from "express";
import Joi from "joi";
import { EMAIL_REGEX, PHONE_REGEX, URL_REGEX } from "../constants/regex.js";

// Интерфейсы для типизации валидируемых данных
export interface Phone {
  type: "support" | "sales" | "general" | "fax" | "accounting" | "other";
  value: string;
  description?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface Email {
  type: "support" | "info" | "sales" | "security" | "hr" | "other";
  value: string;
  description?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface SocialLink {
  platform: "telegram" | "vk" | "github" | "max" | "other";
  url: string;
  title?: string;
  sortOrder: number;
}

export interface OtherContact {
  type: "messenger" | "forum" | "custom" | "chat" | "bot";
  name: string;
  value: string;
  description?: string;
  sortOrder: number;
}

export interface OrganizationContact {
  companyName: string;
  legalAddress?: string;
  physicalAddress?: string;
  phones?: Phone[];
  emails?: Email[];
  socialLinks?: SocialLink[];
  otherContacts?: OtherContact[];
  workingHours?: string;
  isActive?: boolean;
}

// Схемы Joi
const phoneSchema = Joi.object<Phone>({
  type: Joi.string()
    .valid("support", "sales", "general", "fax", "accounting", "other")
    .default("general"),
  value: Joi.string().pattern(PHONE_REGEX).required().messages({
    "string.pattern.base": "Неверный формат телефона",
  }),
  description: Joi.string().max(100),
  isPrimary: Joi.boolean().default(false),
  sortOrder: Joi.number().default(0),
});

const emailSchema = Joi.object<Email>({
  type: Joi.string()
    .valid("support", "info", "sales", "security", "hr", "other")
    .default("general"),
  value: Joi.string().pattern(EMAIL_REGEX).required().messages({
    "string.pattern.base": "Неверный формат email",
  }),
  description: Joi.string().max(100),
  isPrimary: Joi.boolean().default(false),
  sortOrder: Joi.number().default(0),
});

const socialLinkSchema = Joi.object<SocialLink>({
  platform: Joi.string()
    .valid("telegram", "vk", "github", "max", "other")
    .required(),
  url: Joi.string().pattern(URL_REGEX).required().messages({
    "string.pattern.base": "Неверный формат URL",
  }),
  title: Joi.string().max(100),
  sortOrder: Joi.number().default(0),
});

const otherContactSchema = Joi.object<OtherContact>({
  type: Joi.string()
    .valid("messenger", "forum", "custom", "chat", "bot")
    .required(),
  name: Joi.string().max(100).required(),
  value: Joi.string().required(),
  description: Joi.string().max(200),
  sortOrder: Joi.number().default(0),
});

const organizationContactSchema = Joi.object<OrganizationContact>({
  companyName: Joi.string().max(200).required(),
  legalAddress: Joi.string().max(500).allow(""),
  physicalAddress: Joi.string().max(500).allow(""),
  phones: Joi.array().items(phoneSchema).max(10),
  emails: Joi.array().items(emailSchema).max(10),
  socialLinks: Joi.array().items(socialLinkSchema).max(15),
  otherContacts: Joi.array().items(otherContactSchema).max(10),
  workingHours: Joi.string().max(500).allow(""),
  isActive: Joi.boolean(),
}).options({ stripUnknown: true });

// Middleware для валидации
export const validateCreateUpdate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { error, value } = organizationContactSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    res.status(400).json({
      success: false,
      message: "Ошибка валидации",
      errors,
    });
    return;
  }

  req.body = value;
  next();
};
