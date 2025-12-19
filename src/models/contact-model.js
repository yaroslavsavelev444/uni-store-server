const mongoose = require('mongoose');
const { PHONE_REGEX, URL_REGEX, EMAIL_REGEX } = require('../constants/regex');

const contactSchema = new mongoose.Schema({
  // Основная информация
  companyName: {
    type: String,
    required: [true, 'Название компании обязательно'],
    trim: true,
    maxlength: [200, 'Название компании не может превышать 200 символов']
  },
  
  legalAddress: {
    type: String,
    trim: true,
    maxlength: [500, 'Юридический адрес не может превышать 500 символов']
  },
  
  physicalAddress: {
    type: String,
    trim: true,
    maxlength: [500, 'Физический адрес не может превышать 500 символов']
  },
  
  // Телефоны
  phones: [{
    type: {
      type: String,
      enum: ['support', 'sales', 'general', 'fax', 'accounting', 'other'],
      default: 'general'
    },
    value: {
      type: String,
      required: [true, 'Номер телефона обязателен'],
      trim: true,
      match: [PHONE_REGEX, 'Неверный формат телефона']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [100, 'Описание не может превышать 100 символов']
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  }],
  
  // Email
  emails: [{
    type: {
      type: String,
      enum: ['support', 'info', 'sales', 'security', 'hr', 'other'],
      default: 'general'
    },
    value: {
      type: String,
      required: [true, 'Email обязателен'],
      trim: true,
      lowercase: true,
      match: [EMAIL_REGEX, 'Неверный формат email']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [100, 'Описание не может превышать 100 символов']
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  }],
  
  // Социальные сети
  socialLinks: [{
    platform: {
      type: String,
      required: [true, 'Платформа обязательна'],
      enum: ['telegram', 'whatsapp', 'vk', 'youtube', 'linkedin', 'github', 'twitter', 'facebook', 'instagram', 'other']
    },
    url: {
      type: String,
      required: [true, 'URL обязателен'],
      trim: true,
      match: [URL_REGEX, 'Неверный формат URL']
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Название не может превышать 100 символов']
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  }],
  
  // Другие контакты
  otherContacts: [{
    type: {
      type: String,
      enum: ['messenger', 'forum', 'custom', 'chat', 'bot'],
      required: true
    },
    name: {
      type: String,
      required: [true, 'Название обязательно'],
      trim: true,
      maxlength: [100, 'Название не может превышать 100 символов']
    },
    value: {
      type: String,
      required: [true, 'Значение обязательно'],
      trim: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Описание не может превышать 200 символов']
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  }],
  
  // Рабочее время
  workingHours: {
    type: String,
    trim: true,
    maxlength: [500, 'Время работы не может превышать 500 символов']
  },

  
  // Метаданные
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Служебные поля
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  version: {
    type: Number,
    default: 1
  }
  
}, {
  timestamps: true,
  versionKey: false,
  
  toJSON: { 
    virtuals: true, 
    transform: function(doc, ret) {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Пред-валидация для предотвращения дубликатов
contactSchema.pre('save', function(next) {
  // Убираем дубликаты телефонов
  if (this.phones && this.phones.length > 0) {
    const phoneMap = new Map();
    this.phones = this.phones.filter(phone => {
      const key = phone.value.replace(/\D/g, '');
      if (!phoneMap.has(key)) {
        phoneMap.set(key, true);
        return true;
      }
      return false;
    });
  }
  
  // Убираем дубликаты email
  if (this.emails && this.emails.length > 0) {
    const emailMap = new Map();
    this.emails = this.emails.filter(email => {
      if (!emailMap.has(email.value.toLowerCase())) {
        emailMap.set(email.value.toLowerCase(), true);
        return true;
      }
      return false;
    });
  }
  
  // Сортируем массивы по sortOrder
  ['phones', 'emails', 'socialLinks', 'otherContacts'].forEach(field => {
    if (this[field] && this[field].length > 0) {
      this[field].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }
  });
  
  next();
});

module.exports = mongoose.model('Contact', contactSchema);