import joi from "joi";
import validator from "validator";
import xss from "xss";

const { array, object, string } = joi;
const { isAlpha, isStrongPassword } = validator;

// Типизируем функцию санитайзинга
const sanitizeString = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  return xss(value.trim());
};

// Схема для согласия пользователя
const acceptedConsentSchema = object({
  slug: string()
    .custom((value: unknown, helpers: joi.CustomHelpers) => {
      return sanitizeString(value);
    }, "Slug sanitization")
    .min(2)
    .max(100)
    .required(),

  version: string()
    .custom((value: unknown) => sanitizeString(value))
    .min(1)
    .max(20)
    .required(),
});

// Схема регистрации
const registerSchema = object({
  name: string()
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

  email: string()
    .email({ tlds: { allow: false } })
    .custom((value: unknown) => sanitizeString(value))
    .required(),

  password: string()
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

  acceptedConsents: array().items(acceptedConsentSchema).min(1).required(),
});

export default { registerSchema };
export { acceptedConsentSchema, registerSchema };
