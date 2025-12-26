const { Schema, model } = require('mongoose');

const CategorySchema = new Schema({
  // Основная информация
  name: { 
    type: String, 
    required: true, 
    trim: true,
    minlength: 2,
    maxlength: 100,
    index: true
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    index: true
  },
  
  // Описание
  subtitle: { 
    type: String, 
    trim: true,
    maxlength: 200 
  },
  description: { 
    type: String, 
    trim: true,
    maxlength: 2000 
  },
  
    // Изображение - делаем полностью опциональным
  image: { 
    url: { type: String }, // Убрали required: true
    alt: { type: String, maxlength: 255 },
    size: Number,
    mimetype: String
  },

  
  // Порядок сортировки
  order: { 
    type: Number, 
    default: 0,
    min: 0 
  },
  
  // Состояние
  isActive: { 
    type: Boolean, 
    default: true,
    index: true 
  },
  
  // SEO
  metaTitle: { type: String, maxlength: 255 },
  metaDescription: { type: String, maxlength: 500 },
  keywords: [{ type: String, maxlength: 50 }],
  
  // Системные поля
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  updatedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Виртуальное поле для количества продуктов
CategorySchema.virtual('productCount', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// Индексы для оптимизации
CategorySchema.index({ slug: 1 }, { unique: true });
CategorySchema.index({ isActive: 1, order: 1 });
CategorySchema.index({ name: 'text', description: 'text' });

// Middleware для генерации slug
CategorySchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-');
  }
  next();
});

// Статический метод для проверки существования категории
CategorySchema.statics.exists = async function(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  const count = await this.countDocuments({ _id: id });
  return count > 0;
};

module.exports = model('Category', CategorySchema);