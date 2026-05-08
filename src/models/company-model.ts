// models/company-model.js
const { Schema, model } = require('mongoose');

const companySchema = new Schema({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    index: true
  },
  companyName: { 
    type: String, 
    required: true,
    trim: true,
    index: true
  },
  legalAddress: { 
    type: String, 
    required: true,
    trim: true
  },
  companyAddress: { 
    type: String, 
    trim: true
  },
  taxNumber: { 
    type: String, 
    required: true,
    trim: true,
    index: true
  },
  contactPerson: { 
    type: String, 
    trim: true
  },
  phone: { 
    type: String, 
    trim: true
  },
  email: { 
    type: String, 
    trim: true,
    lowercase: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Уникальный индекс для ИНН пользователя
companySchema.index({ taxNumber: 1, user: 1 }, { unique: true });

// Индекс для поиска
companySchema.index({ companyName: 'text', taxNumber: 'text' });

// Предварительная обработка ИНН
companySchema.pre('save', function(next) {
  if (this.taxNumber) {
    // Очищаем ИНН от пробелов
    this.taxNumber = this.taxNumber.replace(/\s/g, '');
  }
  next();
});

// Виртуальное поле для количества заказов
companySchema.virtual('ordersCount', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'companyInfo.companyId',
  count: true
});

// Виртуальное поле для последнего заказа
companySchema.virtual('lastOrder', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'companyInfo.companyId',
  justOne: true,
  options: { sort: { createdAt: -1 } }
});

const CompanyModel = model('Company', companySchema);

module.exports = CompanyModel;