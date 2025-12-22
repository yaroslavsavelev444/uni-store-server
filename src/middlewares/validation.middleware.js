const mongoose = require('mongoose');

const validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: `Некорректный формат ID: ${id}`
    });
  }
  
  next();
};

const validateQueryParams = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    convert: true
  });
  
  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    });
  }
  
  req.validatedQuery = value;
  next();
};

const handleFileUpload = (fieldName, maxCount = 10) => (req, res, next) => {
  if (!req.files || !req.files[fieldName]) {
    return next();
  }
  
  const files = Array.isArray(req.files[fieldName]) 
    ? req.files[fieldName] 
    : [req.files[fieldName]];
  
  if (files.length > maxCount) {
    return res.status(400).json({
      success: false,
      error: `Максимальное количество файлов: ${maxCount}`
    });
  }
  
  // Проверка типов файлов
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const invalidFiles = files.filter(file => !allowedTypes.includes(file.mimetype));
  
  if (invalidFiles.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Недопустимый тип файла. Разрешены: JPG, PNG, WebP, PDF'
    });
  }
  
  next();
};

// ДОБАВИТЬ этот middleware
const validateProduct = (schema) => (req, res, next) => {
  // Если есть файлы в form-data, добавляем их в body
  const dataToValidate = { ...req.body };
  
  // Парсинг JSON полей, если они пришли как строки
  try {
    if (typeof dataToValidate.specifications === 'string') {
      dataToValidate.specifications = JSON.parse(dataToValidate.specifications);
    }
    if (typeof dataToValidate.images === 'string') {
      dataToValidate.images = JSON.parse(dataToValidate.images);
    }
    if (typeof dataToValidate.relatedProducts === 'string') {
      dataToValidate.relatedProducts = JSON.parse(dataToValidate.relatedProducts);
    }
    if (typeof dataToValidate.keywords === 'string') {
      dataToValidate.keywords = JSON.parse(dataToValidate.keywords);
    }
    if (typeof dataToValidate.customAttributes === 'string') {
      dataToValidate.customAttributes = JSON.parse(dataToValidate.customAttributes);
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Некорректный формат JSON в одном из полей'
    });
  }
  
  // Валидация
  const { error, value } = schema.validate(dataToValidate, {
    abortEarly: false,
    stripUnknown: true, // Удалить неизвестные поля
    convert: true // Конвертация типов
  });
  
  if (error) {
    return res.status(400).json({
      success: false,
      errors: error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        type: err.type
      }))
    });
  }
  
  req.validatedData = value;
  next();
};

module.exports = {
  validateObjectId,
  validateQueryParams,
  handleFileUpload,
  validateProduct
};