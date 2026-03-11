import joi from "joi";
import validator from "validator";
import xss from "xss";

const { isAlpha, isStrongPassword } = validator;

const sanitizeString = (value) => {
  if (typeof value !== "string") return value;
  return xss(value.trim());
};

const acceptedConsentSchema = joi.object({
  slug: joi
    .string()
    .custom((value, helpers) => {
      return sanitizeString(value);
    }, "Slug sanitization")
    .min(2)
    .max(100)
    .required(),

  version: joi
    .string()
    .custom((value) => sanitizeString(value))
    .min(1)
    .max(20)
    .required(),
});

const registerSchema = joi.object({
  name: joi
    .string()
    .custom((value, helpers) => {
      const clean = sanitizeString(value);

      if (
        !isAlpha(clean, "ru-RU", { ignore: " -" }) &&
        !isAlpha(clean, "en-US", { ignore: " -" })
      ) {
        return helpers.error("string.invalid_chars", {
          label: "name",
        });
      }

      return clean;
    }, "Name sanitization and validation")
    .min(2)
    .max(50)
    .required(),

  email: joi
    .string()
    .email({ tlds: { allow: false } })
    .custom((value) => sanitizeString(value))
    .required(),

  password: joi
    .string()
    .custom((value, helpers) => {
      if (
        !isStrongPassword(value, {
          minSymbols: 0,
        })
      ) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .min(8)
    .max(64)
    .required(),

  acceptedConsents: joi.array().items(acceptedConsentSchema).min(1).required(),
});

export default { registerSchema };
