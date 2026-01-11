// validators/order.validator.js (с логированием)
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

// Функция для логирования
const logValidation = (data, step) => {
  console.log(`\n=== ВАЛИДАЦИЯ ИНН (${step}) ===`);
  console.log('Полученные данные:', JSON.stringify(data, null, 2));
  console.log('Тип taxNumber:', typeof data.taxNumber);
  console.log('Значение taxNumber:', data.taxNumber);
  console.log('Длина taxNumber:', data.taxNumber ? data.taxNumber.length : 0);
  console.log('Очищенный taxNumber:', data.taxNumber ? data.taxNumber.replace(/\s/g, '') : '');
  console.log('Все newCompanyData:', data);
  console.log('===========================\n');
};

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
      // Логируем входные данные
      console.log(`\n=== ВАЛИДАЦИЯ ИНН (кастомная функция) ===`);
      console.log('Входящее значение value:', value);
      console.log('Тип value:', typeof value);
      
      // Убираем все пробелы и другие разделители для проверки
      const cleaned = value ? value.toString().replace(/\s/g, '') : '';
      console.log('Очищенный cleaned:', cleaned);
      console.log('Длина cleaned:', cleaned.length);
      console.log('Это только цифры?', /^\d+$/.test(cleaned));
      
      if (!/^\d+$/.test(cleaned)) {
        console.log('❌ Ошибка: ИНН содержит не только цифры');
        return helpers.message('ИНН должен содержать только цифры');
      }
      
      if (cleaned.length !== 10 && cleaned.length !== 12) {
        console.log(`❌ Ошибка: длина ${cleaned.length}, нужно 10 или 12`);
        return helpers.message('ИНН должен содержать 10 или 12 цифр');
      }
      
      // Проверка контрольной суммы для 10-значного ИНН
      if (cleaned.length === 10) {
        console.log('🔍 Проверка 10-значного ИНН');
        const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
        let sum = 0;
        
        console.log('Цифры ИНН:', cleaned.split(''));
        console.log('Веса:', weights);
        
        for (let i = 0; i < 9; i++) {
          const digit = parseInt(cleaned[i]);
          const weight = weights[i];
          const product = digit * weight;
          sum += product;
          console.log(`[${i}] ${digit} * ${weight} = ${product} (сумма: ${sum})`);
        }
        
        const controlNumber = (sum % 11) % 10;
        console.log(`Сумма: ${sum}`);
        console.log(`Сумма % 11: ${sum % 11}`);
        console.log(`Ожидаемая контрольная цифра: ${controlNumber}`);
        console.log(`Фактическая 10-я цифра: ${parseInt(cleaned[9])}`);
        
        if (parseInt(cleaned[9]) !== controlNumber) {
          console.log(`❌ Ошибка: ${parseInt(cleaned[9])} !== ${controlNumber}`);
          return helpers.message('Неверный ИНН (неверная контрольная сумма)');
        } else {
          console.log('✅ Контрольная сумма верна');
        }
      }
      
      // Проверка контрольной суммы для 12-значного ИНН
      if (cleaned.length === 12) {
        console.log('🔍 Проверка 12-значного ИНН');
        const weights11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        const weights12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        let sum11 = 0;
        let sum12 = 0;
        
        console.log('Цифры ИНН:', cleaned.split(''));
        
        // Первая контрольная цифра (11-я в номере)
        console.log('\nПервая контрольная цифра (11-я):');
        for (let i = 0; i < 10; i++) {
          const digit = parseInt(cleaned[i]);
          const weight = weights11[i];
          const product = digit * weight;
          sum11 += product;
          console.log(`[${i}] ${digit} * ${weight} = ${product} (сумма11: ${sum11})`);
        }
        
        // Вторая контрольная цифра (12-я в номере)
        console.log('\nВторая контрольная цифра (12-я):');
        for (let i = 0; i < 11; i++) {
          const digit = parseInt(cleaned[i]);
          const weight = weights12[i];
          const product = digit * weight;
          sum12 += product;
          console.log(`[${i}] ${digit} * ${weight} = ${product} (сумма12: ${sum12})`);
        }
        
        const controlNumber11 = (sum11 % 11) % 10;
        const controlNumber12 = (sum12 % 11) % 10;
        
        console.log(`\nСумма11: ${sum11}, %11: ${sum11 % 11}, контрольная11: ${controlNumber11}`);
        console.log(`Сумма12: ${sum12}, %11: ${sum12 % 11}, контрольная12: ${controlNumber12}`);
        console.log(`Фактическая 11-я цифра: ${parseInt(cleaned[10])}`);
        console.log(`Фактическая 12-я цифра: ${parseInt(cleaned[11])}`);
        
        if (parseInt(cleaned[10]) !== controlNumber11 || 
            parseInt(cleaned[11]) !== controlNumber12) {
          console.log(`❌ Ошибка: ${parseInt(cleaned[10])} !== ${controlNumber11} или ${parseInt(cleaned[11])} !== ${controlNumber12}`);
          return helpers.message('Неверный ИНН (неверная контрольная сумма)');
        } else {
          console.log('✅ Контрольные суммы верны');
        }
      }
      
      console.log('✅ ИНН прошел валидацию');
      return value; // Возвращаем оригинальное значение
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
  // Логируем все входящие данные
  console.log('\n=== ВСЕ ВХОДЯЩИЕ ДАННЫЕ ЗАКАЗА ===');
  console.log(JSON.stringify(value, null, 2));
  
  if (value.newCompanyData) {
    logValidation(value.newCompanyData, 'custom validation');
  }
  
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

// Middleware для валидации (с логированием)
const validateCreateOrder = (req, res, next) => {
  console.log('\n=== НАЧАЛО ВАЛИДАЦИИ ЗАКАЗА ===');
  console.log('Тело запроса:', JSON.stringify(req.body, null, 2));
  console.log('newCompanyData в теле:', req.body.newCompanyData);
  
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