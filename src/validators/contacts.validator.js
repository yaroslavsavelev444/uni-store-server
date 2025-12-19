const Joi = require('joi');
const { PHONE_REGEX, EMAIL_REGEX, URL_REGEX } = require('../constants/regex');

const phoneSchema = Joi.object({
  type: Joi.string().valid('support', 'sales', 'general', 'fax', 'accounting', 'other').default('general'),
  value: Joi.string().pattern(PHONE_REGEX).required().messages({
    'string.pattern.base': 'Неверный формат телефона'
  }),
  description: Joi.string().max(100),
  isPrimary: Joi.boolean().default(false),
  sortOrder: Joi.number().default(0)
});

const emailSchema = Joi.object({
  type: Joi.string().valid('support', 'info', 'sales', 'security', 'hr', 'other').default('general'),
  value: Joi.string().pattern(EMAIL_REGEX).required().messages({
    'string.pattern.base': 'Неверный формат email'
  }),
  description: Joi.string().max(100),
  isPrimary: Joi.boolean().default(false),
  sortOrder: Joi.number().default(0)
});

const socialLinkSchema = Joi.object({
  platform: Joi.string().valid(
    'telegram', 'whatsapp', 'vk', 'youtube', 'linkedin',
    'github', 'twitter', 'facebook', 'instagram', 'other'
  ).required(),
  url: Joi.string().pattern(URL_REGEX).required().messages({
    'string.pattern.base': 'Неверный формат URL'
  }),
  title: Joi.string().max(100),
  sortOrder: Joi.number().default(0)
});

const otherContactSchema = Joi.object({
  type: Joi.string().valid('messenger', 'forum', 'custom', 'chat', 'bot').required(),
  name: Joi.string().max(100).required(),
  value: Joi.string().required(),
  description: Joi.string().max(200),
  sortOrder: Joi.number().default(0)
});

const organizationContactSchema = Joi.object({
  companyName: Joi.string().max(200).required(),
  legalAddress: Joi.string().max(500).allow(''),
  physicalAddress: Joi.string().max(500).allow(''),
  phones: Joi.array().items(phoneSchema).max(10),
  emails: Joi.array().items(emailSchema).max(10),
  socialLinks: Joi.array().items(socialLinkSchema).max(15),
  otherContacts: Joi.array().items(otherContactSchema).max(10),
  workingHours: Joi.string().max(500).allow(''),
  isActive: Joi.boolean()
}).options({ stripUnknown: true });

module.exports = {
  validateCreateUpdate: (req, res, next) => {

    console.log('validateCreateUpdate', req.body);

    const { error, value } = organizationContactSchema.validate(req.body, {
      abortEarly: false
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors
      });
    }
    
    req.body = value;
    next();
  }
};