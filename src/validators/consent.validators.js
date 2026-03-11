import joi from "joi";

const slugRegex = /^[a-z0-9_-]+$/i;
const urlRegex = /^(https?:\/\/)[^\s$.?#].[^\s]*$/;

const createConsentSchema = joi.object({
  title: joi.string().min(3).max(255).required(),
  slug: joi.string().pattern(slugRegex).min(3).max(100).required(),
  description: joi.string().allow("").max(1000),
  content: joi.string().min(10).required(),
  documentUrl: joi.string().pattern(urlRegex).allow(null, ""),
  isRequired: joi.boolean().default(true),
  needsAcceptance: joi.boolean().default(true),
});

const updateConsentSchema = joi
  .object({
    title: joi.string().min(3).max(255),
    description: joi.string().allow("").max(1000),
    content: joi.string().min(10),
    documentUrl: joi.string().pattern(urlRegex).allow(null, ""),
    isRequired: joi.boolean(),
    needsAcceptance: joi.boolean(),
    changeDescription: joi.string().max(500).allow(""),
    notifyUsers: joi.boolean().default(false),
    notificationTypes: joi
      .array()
      .items(
        joi.string().valid("email", "sms", "site", "personal_account", "push"),
      )
      .when("notifyUsers", {
        is: true,
        then: joi.array().min(1).required(),
        otherwise: joi.array().optional(),
      }),
  })
  .min(1); // запрещаем пустой update

export default {
  createConsentSchema,
  updateConsentSchema,
};
