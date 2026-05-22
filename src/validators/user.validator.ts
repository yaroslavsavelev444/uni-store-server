import joi from "joi";
import validator from "validator";
import xss from "xss";

const { isAlpha, isStrongPassword } = validator;

// Типизируем функцию санитайзинга
const sanitizeString = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  return xss(value.trim());
};

// Схема для согласия пользователя
const acceptedConsentSchema = joi.object({
  slug: joi
    .string()
    .custom((value: unknown, helpers: joi.CustomHelpers) => {
      return sanitizeString(value);
    }, "Slug sanitization")
    .min(2)
    .max(100)
    .required(),

  version: joi
    .string()
    .custom((value: unknown) => sanitizeString(value))
    .min(1)
    .max(20)
    .required(),
});

// Схема регистрации
const registerSchema = joi.object({
  name: joi
    .string()
    .custom((value: unknown, helpers: joi.CustomHelpers) => {
      const clean = sanitizeString(value);
      if (typeof clean !== "string") {
        return helpers.error("string.base", { label: "name" });
      }

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
    .custom((value: unknown) => sanitizeString(value))
    .required(),

  password: joi
    .string()
    .custom((value: unknown, helpers: joi.CustomHelpers) => {
      if (typeof value !== "string") {
        return helpers.error("string.base");
      }
      if (
        !isStrongPassword(value, {
          minSymbols: 0,
        })
      ) {
        return helpers.error("any.invalid", {
          message: "Password is not strong enough",
        });
      }
      return value;
    })
    .min(8)
    .max(64)
    .required(),

  acceptedConsents: joi.array().items(acceptedConsentSchema).min(1).required(),
});

export default { registerSchema };
export { acceptedConsentSchema, registerSchema };
