const Joi = require('joi');

const slugRegex = /^[a-z0-9_-]+$/i;
const versionRegex = /^\d+\.\d+\.\d+$/;
const urlRegex = /^(https?:\/\/)[^\s$.?#].[^\s]*$/;

const createConsentSchema = Joi.object({
  title: Joi.string().min(3).max(255).required(),
  slug: Joi.string()
    .pattern(slugRegex)
    .min(3)
    .max(100)
    .required(),
  description: Joi.string()
    .allow('')
    .max(1000),
  content: Joi.string()
    .min(10)
    .required(),
  documentUrl: Joi.string()
    .pattern(urlRegex)
    .allow(null, ''),
  isRequired: Joi.boolean().default(true),
  needsAcceptance: Joi.boolean().default(true)
});

const updateConsentSchema = Joi.object({
  title: Joi.string().min(3).max(255),
  description: Joi.string()
    .allow('')
    .max(1000),
  content: Joi.string().min(10),
  documentUrl: Joi.string()
    .pattern(urlRegex)
    .allow(null, ''),
  isRequired: Joi.boolean(),
  needsAcceptance: Joi.boolean(),
  changeDescription: Joi.string()
    .max(500)
    .allow(''),
  notifyUsers: Joi.boolean().default(false),
  notificationTypes: Joi.array()
    .items(Joi.string().valid('email', 'sms', 'site', 'personal_account', 'push'))
    .when('notifyUsers', {
      is: true,
      then: Joi.array().min(1).required(),
      otherwise: Joi.array().optional()
    })
}).min(1); // запрещаем пустой update

module.exports = {
  createConsentSchema,
  updateConsentSchema
};