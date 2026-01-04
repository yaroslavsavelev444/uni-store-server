const mongoose = require('mongoose');
const xss = require('xss');

const contentBlockSchema = new mongoose.Schema({
  // Основные поля
  title: {
    type: String,
    required: [true, 'Заголовок обязателен'],
    trim: true,
    maxlength: [200, 'Заголовок не должен превышать 200 символов']
  },
  
  subtitle: {
    type: String,
    required: [true, 'Подзаголовок обязателен'],
    trim: true,
    maxlength: [500, 'Подзаголовок не должен превышать 500 символов']
  },
  
  // Изображение (опционально)
  imageUrl: {
    type: String,
    default: null,
  },
  
  // Кнопка (опционально)
  button: {
    text: {
      type: String,
      trim: true,
      maxlength: [50, 'Текст кнопки не должен превышать 50 символов'],
      default: null
    },
    action: {
      type: String,
      trim: true,
      maxlength: [500, 'Действие кнопки не должно превышать 500 символов'],
      default: null,
      validate: {
        validator: function(v) {
          if (!v) return true; // null допустимо
          return /^(https?:\/\/|\/)[^\s]+$/.test(v) || /^[a-zA-Z0-9_]+$/.test(v);
        },
        message: 'Некорректный формат действия кнопки'
      }
    },
    style: {
      type: String,
      enum: ['primary', 'secondary', 'outline', null],
      default: null
    }
  },
  
  // Дополнительные поля
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Описание не должно превышать 2000 символов'],
    default: ''
  },
  
  // Порядок отображения
  position: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Статус
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Теги для фильтрации
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Метаданные
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Время создания и обновления
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Предварительная обработка перед сохранением
contentBlockSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // XSS защита для текстовых полей
  if (this.title) this.title = xss(this.title);
  if (this.subtitle) this.subtitle = xss(this.subtitle);
  if (this.description) this.description = xss(this.description);
  if (this.button?.text) this.button.text = xss(this.button.text);
  
  // Нормализация URL
  if (this.imageUrl) {
    this.imageUrl = this.imageUrl.replace(/\\/g, '/');
  }
  
  // Удаляем пустые строки из тегов
  if (this.tags) {
    this.tags = this.tags
      .filter(tag => tag && tag.trim())
      .map(tag => tag.trim().toLowerCase());
  }
  
  next();
});

// Индексы для оптимизации
contentBlockSchema.index({ position: 1, createdAt: -1 });
contentBlockSchema.index({ isActive: 1 });
contentBlockSchema.index({ tags: 1 });
contentBlockSchema.index({ createdAt: -1 });

// Статический метод для поиска активных блоков
contentBlockSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ position: 1, createdAt: -1 });
};

// Метод для проверки наличия кнопки
contentBlockSchema.virtual('hasButton').get(function() {
  return !!(this.button && this.button.text && this.button.action);
});

// Метод для получения безопасного объекта
contentBlockSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.__v;
  delete obj.updatedAt;
  return obj;
};

module.exports = mongoose.model('ContentBlock', contentBlockSchema);