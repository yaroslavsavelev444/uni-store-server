const ApiError = require('../exceptions/api-error');

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return next(ApiError.BadRequest('Ошибка валидации', errors));
    }
    
    // Заменяем валидированные данные
    req[property] = value;
    next();
  };
};

module.exports = validate;