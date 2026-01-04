const Joi = require('joi');

const contentBlockSchema = Joi.object({
  title: Joi.string()
    .required()
    .min(1)
    .max(200)
    .messages({
      'string.empty': 'Заголовок обязателен',
      'string.min': 'Заголовок должен содержать хотя бы 1 символ',
      'string.max': 'Заголовок не должен превышать 200 символов'
    }),
    
  subtitle: Joi.string()
    .required()
    .min(1)
    .max(500)
    .messages({
      'string.empty': 'Подзаголовок обязателен',
      'string.min': 'Подзаголовок должен содержать хотя бы 1 символ',
      'string.max': 'Подзаголовок не должен превышать 500 символов'
    }),
    
  imageUrl: Joi.string().required(),


    
  button: Joi.object({
    text: Joi.string()
      .max(50)
      .allow(null, '')
      .messages({
        'string.max': 'Текст кнопки не должен превышать 50 символов'
      }),
      
    action: Joi.string()
      .max(500)
      .allow(null, '')
      .pattern(/^(https?:\/\/|\/)[^\s]+$|^[a-zA-Z0-9_]+$/)
      .message('Некорректный формат действия кнопки'),
      
    style: Joi.string()
      .valid('primary', 'secondary', 'outline', null)
      .default(null)
  }).allow(null),
  
  description: Joi.string()
    .max(2000)
    .allow('')
    .default('')
    .messages({
      'string.max': 'Описание не должно превышать 2000 символов'
    }),
    
  position: Joi.number()
    .integer()
    .min(0)
    .default(0),
    
  isActive: Joi.boolean()
    .default(true),
    
  tags: Joi.array()
    .items(Joi.string().trim().lowercase())
    .default([]),
    
  metadata: Joi.object()
    .default({})
});

const idSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Некорректный формат ID',
      'any.required': 'ID обязателен'
    })
});

const updateSchema = contentBlockSchema.keys({
  title: Joi.string()
    .min(1)
    .max(200)
    .messages({
      'string.min': 'Заголовок должен содержать хотя бы 1 символ',
      'string.max': 'Заголовок не должен превышать 200 символов'
    }),
    
  subtitle: Joi.string()
    .min(1)
    .max(500)
    .messages({
      'string.min': 'Подзаголовок должен содержать хотя бы 1 символ',
      'string.max': 'Подзаголовок не должен превышать 500 символов'
    })
});

module.exports = {
  contentBlockSchema,
  idSchema,
  updateSchema
};