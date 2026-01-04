// validators/order.validator.js (обновленный)
const Joi = require('joi');
const mongoose = require('mongoose');
const { OrderStatus, DeliveryMethod } = require('../models/order-model');

// Базовые схемы валидации
const deliveryAddressSchema = Joi.object({
  street: Joi.string().required().min(5).max(200)
    .messages({
      'string.empty': 'Укажите улицу',
      'string.min': 'Адрес слишком короткий (мин. 5 символов)',
      'string.max': 'Адрес слишком длинный (макс. 200 символов)'
    }),
  city: Joi.string().required().min(2).max(50)
    .messages({
      'string.empty': 'Укажите город',
      'string.min': 'Название города слишком короткое',
      'string.max': 'Название города слишком длинное'
    }),
  postalCode: Joi.string().pattern(/^\d{6}$/)
    .messages({
      'string.pattern.base': 'Индекс должен содержать 6 цифр'
    }),
  country: Joi.string().default('Россия')
});

const savePreferencesSchema = Joi.object({
  saveAddress: Joi.boolean().default(false),
  saveRecipient: Joi.boolean().default(false),
  saveCompany: Joi.boolean().default(false)
});

// Схема для данных новой компании
const newCompanySchema = Joi.object({
  companyName: Joi.string().required().min(3).max(200)
    .messages({
      'string.empty': 'Укажите название компании',
      'string.min': 'Название компании слишком короткое',
      'string.max': 'Название компании слишком длинное'
    }),
  companyAddress: Joi.string().required().min(10).max(300)
    .messages({
      'string.empty': 'Укажите адрес компании',
      'string.min': 'Адрес компании слишком короткий',
      'string.max': 'Адрес компании слишком длинный'
    }),
  legalAddress: Joi.string().max(300)
    .messages({
      'string.max': 'Юридический адрес слишком длинный'
    }),
  taxNumber: Joi.string()
    .required()
    .custom((value, helpers) => {
      // Убираем все пробелы для проверки
      const cleaned = value.replace(/\s/g, '');
      
      if (!/^\d+$/.test(cleaned)) {
        return helpers.message('ИНН должен содержать только цифры');
      }
      
      if (cleaned.length !== 10 && cleaned.length !== 12) {
        return helpers.message('ИНН должен содержать 10 или 12 цифр');
      }
      
      return value; // Возвращаем оригинальное значение с пробелами
    }, 'Валидация ИНН')
    .messages({
      'any.required': 'Укажите ИНН',
    }),
  contactPerson: Joi.string().max(100)
    .messages({
      'string.max': 'Имя контактного лица слишком длинное'
    })
});

// Валидатор для создания заказа (обновленный)
const createOrderValidator = Joi.object({
  // Основные поля
  deliveryMethod: Joi.string().valid('delivery', 'pickup').required()
    .messages({
      'any.only': 'Выберите способ доставки',
      'any.required': 'Способ доставки обязателен'
    }),
  
  recipientName: Joi.string().required().min(5).max(100)
    .pattern(/^[А-ЯЁа-яёA-Za-z\s-]{2,} [А-ЯЁа-яёA-Za-z\s-]{2,}(?: [А-ЯЁа-яёA-Za-z\s-]{2,})?$/)
    .messages({
      'string.empty': 'Укажите ФИО получателя',
      'string.min': 'ФИО слишком короткое (мин. 5 символов)',
      'string.max': 'ФИО слишком длинное (макс. 100 символов)',
      'string.pattern.base': 'Введите имя и фамилию'
    }),
  
  recipientPhone: Joi.string().required().pattern(/^7\d{10}$/)
    .messages({
      'string.empty': 'Укажите телефон',
      'string.pattern.base': 'Введите корректный номер телефона'
    }),
  
  recipientEmail: Joi.string().email().required()
    .messages({
      'string.email': 'Введите корректный email',
      'string.empty': 'Email обязателен'
    }),
  
  paymentMethod: Joi.string().required()
    .messages({
      'string.empty': 'Выберите способ оплаты'
    }),
  
  // Данные доставки - проверяем в зависимости от метода
  deliveryAddress: Joi.alternatives().conditional('deliveryMethod', {
    is: 'delivery',
    then: deliveryAddressSchema.required(),
    otherwise: Joi.forbidden()
  }).messages({
    'any.required': 'Для доставки укажите адрес'
  }),
  
  transportCompanyId: Joi.alternatives().conditional('deliveryMethod', {
    is: 'delivery',
    then: Joi.string().required(),
    otherwise: Joi.forbidden()
  }).messages({
    'any.required': 'Выберите транспортную компанию'
  }),
  
  pickupPointId: Joi.alternatives().conditional('deliveryMethod', {
    is: 'pickup',
    then: Joi.string().required(),
    otherwise: Joi.forbidden()
  }).messages({
    'any.required': 'Выберите пункт самовывоза'
  }),
  
  deliveryNotes: Joi.string().max(500)
    .messages({
      'string.max': 'Примечание слишком длинное (макс. 500 символов)'
    }).optional().allow(null),
  
  // Данные компании - ОБНОВЛЕННЫЙ БЛОК
  // Вариант 1: Использование существующей компании по ID
  existingCompanyId: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message('Некорректный формат ID компании');
      }
      return value;
    })
    .optional(),
  
  // Вариант 2: Создание новой компании
  newCompanyData: Joi.alternatives().conditional('existingCompanyId', {
    is: Joi.exist(),
    then: Joi.forbidden().messages({
      'any.unknown': 'Нельзя одновременно указывать ID существующей компании и данные для новой компании'
    }),
    otherwise: newCompanySchema.optional()
  }),
  
  // Прочие поля
  notes: Joi.string()
    .max(1000)
    .allow('', null)
    .optional()
    .default('')
    .messages({
      'string.max': 'Примечание слишком длинное'
    }),
  
  awaitingInvoice: Joi.boolean().default(false),
  
  savePreferences: savePreferencesSchema.default({
    saveAddress: false,
    saveRecipient: false,
    saveCompany: false
  }),
  
  // Метаданные
  ipAddress: Joi.string().ip(),
  userAgent: Joi.string(),
  source: Joi.string().valid('web', 'mobile', 'api', 'admin')
}).custom((value, helpers) => {
  // Кастомная валидация - не должно быть одновременно транспортной компании и пункта выдачи
  if (value.deliveryMethod === 'delivery' && value.pickupPointId) {
    return helpers.error('any.invalid', {
      message: 'При доставке не должен быть выбран пункт самовывоза'
    });
  }
  
  if (value.deliveryMethod === 'pickup' && value.transportCompanyId) {
    return helpers.error('any.invalid', {
      message: 'При самовывозе не должна быть выбрана транспортная компания'
    });
  }
  
  // Кастомная валидация - проверяем, что указан либо ID существующей компании, либо данные новой
  if (value.existingCompanyId && value.newCompanyData) {
    return helpers.error('any.invalid', {
      message: 'Нельзя одновременно указывать ID существующей компании и данные для новой компании'
    });
  }
  
  return value;
}).messages({
  'any.invalid': '{{#label}} - {{#message}}'
});

// Middleware для валидации
const validateCreateOrder = (req, res, next) => {
  const { error, value } = createOrderValidator.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Ошибка валидации данных заказа',
      errors
    });
  }
  
  // Определяем, является ли заказ от компании
  value.isCompany = !!(value.existingCompanyId || value.newCompanyData);
  
  // Заменяем валидированные данные
  req.body = value;
  next();
};

module.exports = {
  createOrderValidator,
  validateCreateOrder
};