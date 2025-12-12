const Joi = require("joi");

const schema = Joi.object({
  name: Joi.string().optional(),
  ios: Joi.object({
    url: Joi.string().uri({ scheme: [/https?/] }).allow("").optional(),
    meta: Joi.object().optional()
  }).optional(),
  android: Joi.object({
    url: Joi.string().uri({ scheme: [/https?/] }).allow("").optional(),
    meta: Joi.object().optional()
  }).optional(),
  note: Joi.string().allow("").optional(),
  active: Joi.boolean().optional()
});

module.exports = (payload) => schema.validate(payload, { abortEarly: false });