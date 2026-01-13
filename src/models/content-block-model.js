const mongoose = require('mongoose');
const xss = require('xss');
const fileService = require('../utils/fileManager');

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
  
  // Кто создал и обновил
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Функция для проверки, нужно ли обрабатывать URL
const shouldProcessUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  // Не обрабатываем если уже полный URL
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return false;
  }
  
  // Обрабатываем только локальные пути
  return url.startsWith('/uploads/');
};

// Функция для обработки одного документа ContentBlock
const processContentBlockDocument = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  
  // Обработка imageUrl
  if (doc.imageUrl && shouldProcessUrl(doc.imageUrl)) {
    doc.imageUrl = fileService.getFileUrl(doc.imageUrl);
  }
  
  // Обработка button.action если это локальный путь
  if (doc.button && doc.button.action && shouldProcessUrl(doc.button.action)) {
    doc.button = {
      ...doc.button,
      action: fileService.getFileUrl(doc.button.action)
    };
  }
  
  // Обработка метаданных если там есть URL
  if (doc.metadata && typeof doc.metadata === 'object') {
    // Проверяем все строковые поля в metadata
    const processMetadata = (metadata) => {
      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === 'string' && shouldProcessUrl(value)) {
          metadata[key] = fileService.getFileUrl(value);
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          processMetadata(value);
        } else if (Array.isArray(value)) {
          metadata[key] = value.map(item => {
            if (typeof item === 'string' && shouldProcessUrl(item)) {
              return fileService.getFileUrl(item);
            }
            return item;
          });
        }
      }
      return metadata;
    };
    
    doc.metadata = processMetadata(doc.metadata);
  }
  
  return doc;
};

// Middleware для обработки результатов запросов
contentBlockSchema.post(['find', 'findOne', 'findById'], function(docs) {
  if (!docs) return docs;
  
  if (Array.isArray(docs)) {
    return docs.map(processContentBlockDocument);
  }
  
  return processContentBlockDocument(docs);
});

// Middleware для агрегации
contentBlockSchema.post('aggregate', function(docs) {
  if (!docs || !Array.isArray(docs)) return docs;
  
  return docs.map(processContentBlockDocument);
});

// Middleware для toJSON (если вызывается вручную)
contentBlockSchema.methods.toJSON = function() {
  const obj = this.toObject ? this.toObject() : this;
  return processContentBlockDocument(obj);
};

// Предварительная обработка перед сохранением
contentBlockSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // XSS защита для текстовых полей
  if (this.title) this.title = xss(this.title);
  if (this.subtitle) this.subtitle = xss(this.subtitle);
  if (this.description) this.description = xss(this.description);
  if (this.button?.text) this.button.text = xss(this.button.text);
  
  // Нормализация URL (только для сохранения, не для обработки)
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
contentBlockSchema.index({ createdBy: 1 });
contentBlockSchema.index({ updatedBy: 1 });

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
  return obj;
};

// Дополнительные статические методы с автоматической обработкой
contentBlockSchema.statics.findActiveWithProcessedUrls = function() {
  return this.find({ isActive: true })
    .sort({ position: 1, createdAt: -1 })
    .then(docs => {
      if (Array.isArray(docs)) {
        return docs.map(processContentBlockDocument);
      }
      return processContentBlockDocument(docs);
    });
};

module.exports = mongoose.model('ContentBlock', contentBlockSchema);