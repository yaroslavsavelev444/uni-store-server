import joi from "joi";

const contentBlockSchema = joi.object({
  title: joi.string().required().min(1).max(200).messages({
    "string.empty": "Заголовок обязателен",
    "string.min": "Заголовок должен содержать хотя бы 1 символ",
    "string.max": "Заголовок не должен превышать 200 символов",
  }),

  subtitle: joi.string().required().min(1).max(500).messages({
    "string.empty": "Подзаголовок обязателен",
    "string.min": "Подзаголовок должен содержать хотя бы 1 символ",
    "string.max": "Подзаголовок не должен превышать 500 символов",
  }),

  imageUrl: joi.string().allow(null, ""),
  button: joi
    .object({
      text: joi.string().max(50).allow(null, "").messages({
        "string.max": "Текст кнопки не должен превышать 50 символов",
      }),

      action: joi
        .string()
        .max(500)
        .allow(null, "")
        .pattern(/^(https?:\/\/|\/)[^\s]+$|^[a-zA-Z0-9_]+$/)
        .message("Некорректный формат действия кнопки"),

      style: joi
        .string()
        .valid("primary", "secondary", "outline", null)
        .default(null),
    })
    .allow(null),

  description: joi.string().max(2000).allow("").default("").messages({
    "string.max": "Описание не должно превышать 2000 символов",
  }),

  position: joi.number().integer().min(0).default(0),

  isActive: joi.boolean().default(true),

  tags: joi.array().items(joi.string().trim().lowercase()).default([]),

  metadata: joi.object().default({}),
});

const idSchema = joi.object({
  id: joi
    .string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Некорректный формат ID",
      "any.required": "ID обязателен",
    }),
});

const updateSchema = contentBlockSchema.keys({
  title: joi.string().min(1).max(200).messages({
    "string.min": "Заголовок должен содержать хотя бы 1 символ",
    "string.max": "Заголовок не должен превышать 200 символов",
  }),

  subtitle: joi.string().min(1).max(500).messages({
    "string.min": "Подзаголовок должен содержать хотя бы 1 символ",
    "string.max": "Подзаголовок не должен превышать 500 символов",
  }),
});

export default {
  contentBlockSchema,
  idSchema,
  updateSchema,
};
