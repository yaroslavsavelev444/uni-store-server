import { array, boolean, number, object, string } from "joi";

const contentBlockSchema = object({
  title: string().required().min(1).max(200).messages({
    "string.empty": "Заголовок обязателен",
    "string.min": "Заголовок должен содержать хотя бы 1 символ",
    "string.max": "Заголовок не должен превышать 200 символов",
  }),

  subtitle: string().required().min(1).max(500).messages({
    "string.empty": "Подзаголовок обязателен",
    "string.min": "Подзаголовок должен содержать хотя бы 1 символ",
    "string.max": "Подзаголовок не должен превышать 500 символов",
  }),

  imageUrl: string().allow(null, ""),
  button: object({
    text: string().max(50).allow(null, "").messages({
      "string.max": "Текст кнопки не должен превышать 50 символов",
    }),

    action: string()
      .max(500)
      .allow(null, "")
      .pattern(/^(https?:\/\/|\/)[^\s]+$|^[a-zA-Z0-9_]+$/)
      .message("Некорректный формат действия кнопки"),

    style: string()
      .valid("primary", "secondary", "outline", null)
      .default(null),
  }).allow(null),

  description: string().max(2000).allow("").default("").messages({
    "string.max": "Описание не должно превышать 2000 символов",
  }),

  position: number().integer().min(0).default(0),

  isActive: boolean().default(true),

  tags: array().items(string().trim().lowercase()).default([]),

  metadata: object().default({}),
});

const idSchema = object({
  id: string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Некорректный формат ID",
      "any.required": "ID обязателен",
    }),
});

const updateSchema = contentBlockSchema.keys({
  title: string().min(1).max(200).messages({
    "string.min": "Заголовок должен содержать хотя бы 1 символ",
    "string.max": "Заголовок не должен превышать 200 символов",
  }),

  subtitle: string().min(1).max(500).messages({
    "string.min": "Подзаголовок должен содержать хотя бы 1 символ",
    "string.max": "Подзаголовок не должен превышать 500 символов",
  }),
});

export default {
  contentBlockSchema,
  idSchema,
  updateSchema,
};
