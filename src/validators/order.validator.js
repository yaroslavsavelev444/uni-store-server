const Joi = require('joi');
const mongoose = require('mongoose');
const { DeliveryMethod, PaymentMethod } = require('../models/order-model');

// Базовые схемы валидации

// Схема адреса для доставки до двери (полный адрес)
const doorToDoorAddressSchema = Joi.object({
  street: Joi.string().required().min(5).max(200)
    .messages({
      'string.empty': 'Укажите улицу, дом и квартиру',
      'string.min': 'Адрес слишком короткий (мин. 5 символов)',
      'string.max': 'Адрес слишком длинный (макс. 200 символов)'
    }),
  city: Joi.string().required().min(2).max(50)
    .messages({
      'string.empty': 'Укажите город',
      'string.min': 'Название города слишком короткое',
      'string.max': 'Название города слишком длинное'
    }),
  postalCode: Joi.string().required().pattern(/^\d{6}$/)
    .messages({
      'string.empty': 'Укажите почтовый индекс',
      'string.pattern.base': 'Индекс должен содержать 6 цифр'
    }),
  country: Joi.string().default('Россия')
});

// Схема адреса для доставки в ПВЗ (только улица/адрес ПВЗ)
const pickupPointAddressSchema = Joi.object({
  street: Joi.string().required().min(5).max(300)
    .messages({
      'string.empty': 'Укажите адрес ПВЗ',
      'string.min': 'Адрес ПВЗ слишком короткий (мин. 5 символов)',
      'string.max': 'Адрес ПВЗ слишком длинный (макс. 300 символов)'
    }),
  // Для ПВЗ город и индекс могут быть не обязательными или заполняться автоматически
  city: Joi.string().optional().allow('', null).max(50)
    .messages({
      'string.max': 'Название города слишком длинное'
    }),
  postalCode: Joi.string().optional().allow('', null).pattern(/^\d{6}$/)
    .messages({
      'string.pattern.base': 'Индекс должен содержать 6 цифр'
    }),
  country: Joi.string().default('Россия')
});

// Общая схема адреса для валидации в зависимости от метода доставки
const getDeliveryAddressSchema = (deliveryMethod) => {
  switch(deliveryMethod) {
    case DeliveryMethod.DOOR_TO_DOOR:
      return doorToDoorAddressSchema;
    case DeliveryMethod.PICKUP_POINT:
      return pickupPointAddressSchema;
    default:
      return Joi.any().forbidden();
  }
};

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
      const cleaned = value ? value.toString().replace(/\s/g, '') : '';
      
      if (!/^\d+$/.test(cleaned)) {
        return helpers.message('ИНН должен содержать только цифры');
      }
      
      if (cleaned.length !== 10 && cleaned.length !== 12) {
        return helpers.message('ИНН должен содержать 10 или 12 цифр');
      }
      
      // Проверка контрольной суммы для 10-значного ИНН
      if (cleaned.length === 10) {
        const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
        let sum = 0;
        
        for (let i = 0; i < 9; i++) {
          sum += parseInt(cleaned[i]) * weights[i];
        }
        
        const controlNumber = (sum % 11) % 10;
        if (parseInt(cleaned[9]) !== controlNumber) {
          return helpers.message('Неверный ИНН (неверная контрольная сумма)');
        }
      }
      
      // Проверка контрольной суммы для 12-значного ИНН
      if (cleaned.length === 12) {
        const weights11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        const weights12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        let sum11 = 0;
        let sum12 = 0;
        
        // Первая контрольная цифра (11-я в номере)
        for (let i = 0; i < 10; i++) {
          sum11 += parseInt(cleaned[i]) * weights11[i];
        }
        
        // Вторая контрольная цифра (12-я в номере)
        for (let i = 0; i < 11; i++) {
          sum12 += parseInt(cleaned[i]) * weights12[i];
        }
        
        const controlNumber11 = (sum11 % 11) % 10;
        const controlNumber12 = (sum12 % 11) % 10;
        
        if (parseInt(cleaned[10]) !== controlNumber11 || 
            parseInt(cleaned[11]) !== controlNumber12) {
          return helpers.message('Неверный ИНН (неверная контрольная сумма)');
        }
      }
      
      return value;
    }, 'Валидация ИНН')
    .messages({
      'any.required': 'Укажите ИНН',
    }),

  contactPerson: Joi.string().max(100)
    .messages({
      'string.max': 'Имя контактного лица слишком длинное'
    })
});

// Валидатор для создания заказа (ОБНОВЛЕННЫЙ)
const createOrderValidator = Joi.object({
  // Основные поля
  deliveryMethod: Joi.string()
    .valid(...Object.values(DeliveryMethod))
    .required()
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
  
  paymentMethod: Joi.string()
    .valid(...Object.values(PaymentMethod))
    .required()
    .messages({
      'any.only': 'Выберите корректный способ оплаты',
      'any.required': 'Способ оплаты обязателен'
    }),
  
  // Данные доставки - динамическая схема в зависимости от метода
  deliveryAddress: Joi.alternatives()
    .conditional('deliveryMethod', [
      {
        is: DeliveryMethod.DOOR_TO_DOOR,
        then: doorToDoorAddressSchema.required(),
      },
      {
        is: DeliveryMethod.PICKUP_POINT,
        then: pickupPointAddressSchema.required(),
      },
      {
        is: DeliveryMethod.SELF_PICKUP,
        then: Joi.forbidden()
      }
    ])
    .messages({
      'any.required': 'Для доставки укажите адрес'
    }),
  
  transportCompanyId: Joi.alternatives()
    .conditional('deliveryMethod', [
      {
        is: DeliveryMethod.DOOR_TO_DOOR,
        then: Joi.string().required(),
      },
      {
        is: DeliveryMethod.PICKUP_POINT,
        then: Joi.string().required(),
      },
      {
        is: DeliveryMethod.SELF_PICKUP,
        then: Joi.forbidden()
      }
    ])
    .messages({
      'any.required': 'Для доставки выберите транспортную компанию'
    }),
  
  pickupPointId: Joi.alternatives()
    .conditional('deliveryMethod', {
      is: DeliveryMethod.SELF_PICKUP,
      then: Joi.string().required(),
      otherwise: Joi.forbidden()
    })
    .messages({
      'any.required': 'Для самовывоза выберите пункт выдачи'
    }),
  
  deliveryNotes: Joi.string().max(500)
    .messages({
      'string.max': 'Примечание слишком длинное (макс. 500 символов)'
    }).optional().allow(null),
  
  // Данные компании
  isCompany: Joi.boolean().default(false),
  existingCompanyId: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message('Некорректный формат ID компании');
      }
      return value;
    })
    .optional(),
  
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
  // Проверка совместимости способа оплаты и доставки
  if (value.deliveryMethod && value.paymentMethod) {
    const deliveryMethod = value.deliveryMethod;
    const paymentMethod = value.paymentMethod;
    
    // Проверка для DOOR_TO_DOOR
    if (deliveryMethod === DeliveryMethod.DOOR_TO_DOOR) {
      if (paymentMethod !== PaymentMethod.INVOICE) {
        return helpers.error('any.invalid', {
          message: 'Для доставки до двери доступна только оплата по счету или курьеру'
        });
      }
    }
    
    // Проверка для PICKUP_POINT
    if (deliveryMethod === DeliveryMethod.PICKUP_POINT) {
      if (paymentMethod !== PaymentMethod.INVOICE) {
        return helpers.error('any.invalid', {
          message: 'Для доставки в ПВЗ доступна только оплата по счету или при получении в ПВЗ'
        });
      }
    }
    
    // Проверка для SELF_PICKUP
    if (deliveryMethod === DeliveryMethod.SELF_PICKUP) {
      if (paymentMethod !== PaymentMethod.INVOICE && 
          paymentMethod !== PaymentMethod.SELF_PICKUP_CARD && 
          paymentMethod !== PaymentMethod.SELF_PICKUP_CASH) {
        return helpers.error('any.invalid', {
          message: 'Для самовывоза доступна только оплата по счету, картой или наличными при самовывозе'
        });
      }
    }
  }
  
  // Проверка обязательных полей в зависимости от доставки
  if (value.deliveryMethod === DeliveryMethod.DOOR_TO_DOOR || 
      value.deliveryMethod === DeliveryMethod.PICKUP_POINT) {
    if (!value.transportCompanyId) {
      return helpers.error('any.invalid', {
        message: 'Для выбранного способа доставки требуется транспортная компания'
      });
    }
    
    if (!value.deliveryAddress) {
      return helpers.error('any.invalid', {
        message: 'Для выбранного способа доставки требуется адрес'
      });
    }
  }
  
  if (value.deliveryMethod === DeliveryMethod.SELF_PICKUP) {
    if (!value.pickupPointId) {
      return helpers.error('any.invalid', {
        message: 'Для самовывоза требуется пункт выдачи'
      });
    }
  }
  
  // Проверка адреса в зависимости от метода доставки
  if (value.deliveryAddress) {
    if (value.deliveryMethod === DeliveryMethod.DOOR_TO_DOOR) {
      if (!value.deliveryAddress.city || !value.deliveryAddress.postalCode) {
        return helpers.error('any.invalid', {
          message: 'Для доставки до двери требуется указать город и почтовый индекс'
        });
      }
    }
  }
  
  return value;
}).messages({
  'any.invalid': '{{#message}}'
});

// Middleware для валидации
const validateCreateOrder = (req, res, next) => {
  console.log('\n=== ВАЛИДАЦИЯ ЗАКАЗА ===');
  console.log('Тело запроса:', JSON.stringify(req.body, null, 2));
  
  const { error, value } = createOrderValidator.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    console.log('\n=== ОШИБКИ ВАЛИДАЦИИ ===');
    console.log('Ошибки:', JSON.stringify(error.details, null, 2));
    
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
  
  console.log('\n=== УСПЕШНАЯ ВАЛИДАЦИЯ ===');
  console.log('Валидированные данные:', JSON.stringify(value, null, 2));
  
  // Обработка адреса для ПВЗ - если город и индекс не указаны, можно заполнить пустыми значениями
  if (value.deliveryMethod === DeliveryMethod.PICKUP_POINT && value.deliveryAddress) {
    if (!value.deliveryAddress.city) {
      value.deliveryAddress.city = '';
    }
    if (!value.deliveryAddress.postalCode) {
      value.deliveryAddress.postalCode = '';
    }
  }
  
  // Заменяем валидированные данные
  req.body = value;
  next();
};

module.exports = {
  createOrderValidator,
  validateCreateOrder,
  doorToDoorAddressSchema,
  pickupPointAddressSchema
};