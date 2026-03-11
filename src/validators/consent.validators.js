import { array, boolean, object, string } from "joi";

const slugRegex = /^[a-z0-9_-]+$/i;
const urlRegex = /^(https?:\/\/)[^\s$.?#].[^\s]*$/;

const createConsentSchema = object({
  title: string().min(3).max(255).required(),
  slug: string().pattern(slugRegex).min(3).max(100).required(),
  description: string().allow("").max(1000),
  content: string().min(10).required(),
  documentUrl: string().pattern(urlRegex).allow(null, ""),
  isRequired: boolean().default(true),
  needsAcceptance: boolean().default(true),
});

const updateConsentSchema = object({
  title: string().min(3).max(255),
  description: string().allow("").max(1000),
  content: string().min(10),
  documentUrl: string().pattern(urlRegex).allow(null, ""),
  isRequired: boolean(),
  needsAcceptance: boolean(),
  changeDescription: string().max(500).allow(""),
  notifyUsers: boolean().default(false),
  notificationTypes: array()
    .items(string().valid("email", "sms", "site", "personal_account", "push"))
    .when("notifyUsers", {
      is: true,
      then: array().min(1).required(),
      otherwise: array().optional(),
    }),
}).min(1); // запрещаем пустой update

export default {
  createConsentSchema,
  updateConsentSchema,
};
