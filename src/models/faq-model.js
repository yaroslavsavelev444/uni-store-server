const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Вопрос обязателен для заполнения'],
    trim: true
  },
  answer: {
    type: String,
    required: [true, 'Ответ обязателен для заполнения']
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const topicSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Название темы обязательно для заполнения'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  questions: [questionSchema],
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Индексы для оптимизации запросов
topicSchema.index({ order: 1, isActive: 1 });
questionSchema.index({ order: 1, isActive: 1 });

// Middleware для обновления даты изменения
topicSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

questionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Экспортируем модели КАК ОДИН ОБЪЕКТ
module.exports = {
  FaqTopicModel: mongoose.model('FaqTopic', topicSchema),
  FaqQuestionModel: mongoose.model('FaqQuestion', questionSchema)
};