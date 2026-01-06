const Joi = require("joi");
const xss = require("xss");
const validator = require("validator");

const sanitizeString = (value) => {
  return xss(value.trim());
};

const registerSchema = Joi.object({
  name: Joi.string()
    .custom((value, helpers) => {
      const clean = sanitizeString(value);
      if (!validator.isAlpha(clean, "ru-RU", { ignore: " -" }) && !validator.isAlpha(clean, "en-US", { ignore: " -" })) {
        return helpers.error("string.invalid_chars", { label: "name" });
      }
      return clean;
    }, "Name sanitization and validation")
    .min(2)
    .max(50)
    .required(),


  email: Joi.string()
    .email({ tlds: { allow: false } })
    .custom((value) => sanitizeString(value))
    .required(),

  password: Joi.string()
    .custom((value, helpers) => {
      if (!validator.isStrongPassword(value, { minSymbols: 0 })) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .min(8)
    .max(64)
    .required(),
    
});

module.exports = { registerSchema };