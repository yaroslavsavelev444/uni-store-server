const { Schema, model, Types } = require("mongoose");
const fileService = require('../utils/fileManager');


const ProductStatus = {
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  PREORDER: "preorder",
  ARCHIVED: "archived",
};

const ProductSchema = new Schema(
  {
    // Основная информация
    sku: {
      type: String,
      unique: true,
      required: [true, 'SKU обязателен'],
      trim: true,
      index: true,
      validate: {
        validator: function(v) {
          return /^[a-zA-Z0-9_-]+$/.test(v);
        },
        message: 'SKU может содержать только буквы, цифры, дефисы и подчеркивания'
      }
    },
    title: {
      type: String,
      required: [true, 'Название обязательно'],
      trim: true,
      minlength: [3, 'Название должно содержать минимум 3 символа'],
      maxlength: [200, 'Название должно содержать максимум 200 символов']
    },
    description: {
      type: String,
      required: [true, 'Описание обязательно'],
      minlength: [10, 'Описание должно содержать минимум 10 символов'],
      maxlength: [5000, 'Описание должно содержать максимум 5000 символов']
    },

    // Ценообразование
    priceForIndividual: {
      type: Number,
      required: [true, 'Цена для физ. лиц обязательна'],
      min: [0, 'Цена не может быть отрицательной'],
      max: [100000000, 'Цена не может превышать 1 000 000 00']
    },

    // Скидки
    discount: {
      isActive: { type: Boolean, default: false },
      percentage: { 
        type: Number, 
        default: 0, 
        min: [0, 'Процент скидки не может быть отрицательным'],
        max: [100, 'Процент скидки не может превышать 100']
      },
      amount: { 
        type: Number, 
        default: 0, 
        min: [0, 'Сумма скидки не может быть отрицательной'] 
      },
      validFrom: Date,
      validUntil: Date,
      minQuantity: { type: Number, default: 1, min: [1, 'Минимальное количество не может быть меньше 1'] }
    },

    // Статус и наличие
    status: {
      type: String,
      enum: {
        values: Object.values(ProductStatus),
        message: 'Некорректный статус продукта'
      },
      default: ProductStatus.AVAILABLE
    },

    minOrderQuantity: {
      type: Number,
      default: 1,
      min: [1, 'Минимальное количество заказа не может быть меньше 1'],
      max: [1000, 'Минимальное количество заказа не может превышать 1000']
    },
    maxOrderQuantity: {
      type: Number,
      min: [1, 'Максимальное количество заказа не может быть меньше 1'],
      max: [10000, 'Максимальное количество заказа не может превышать 10000'],
      validate: {
        validator: function(v) {
          return !v || v >= this.minOrderQuantity;
        },
        message: 'Максимальное количество должно быть больше или равно минимальному'
      }
    },

    // Категория
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, 'Категория обязательна'],
      index: true
    },

    // Видимость
    isVisible: { 
      type: Boolean, 
      default: true,
      index: true 
    },
    showOnMainPage: { 
      type: Boolean, 
      default: false,
      index: true 
    },

    mainImage: { 
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^(\/uploads\/products\/images\/|https?:\/\/)/.test(v);
        },
        message: 'Некорректный формат основного изображения'
      }
    },
    images: [
      {
        url: {
          type: String,
          required: true,
          validate: {
            validator: function(v) {
              return /^(\/uploads\/products\/images\/|https?:\/\/)/.test(v);
            },
            message: 'Некорректный формат изображения'
          }
        },
        alt: { type: String, maxlength: 255 },
        order: { type: Number, default: 0, min: 0 }
      }
    ],
    
    instruction: {
      type: {
        type: String,
        enum: ['file', 'link'],
      },
      url: {
        type: String,
        validate: {
          validator: function(v) {
            if (!this.instruction || !this.instruction.type) return true;
            
            if (this.instruction.type === 'file') {
              return /^(\/uploads\/products\/instructions\/|https?:\/\/)/.test(v);
            } else if (this.instruction.type === 'link') {
              try {
                new URL(v);
                return true;
              } catch {
                return false;
              }
            }
            return true;
          },
          message: function(props) {
            const instructionType = this.instruction?.type;
            if (instructionType === 'file') {
              return 'Некорректный формат файла инструкции';
            } else if (instructionType === 'link') {
              return 'Некорректный формат ссылки';
            }
            return 'Некорректный формат инструкции';
          }
        }
      },
      originalName: {
        type: String,
        maxlength: 255
      },
      size: {
        type: Number,
        min: 0,
        max: 50 * 1024 * 1024, // 50MB
      },
      title: {
        type: String,
        maxlength: 255
      },
      alt: { type: String, maxlength: 255 },
      mimetype: { type: String }
    },


    // Технические характеристики
    specifications: [
      {
        name: { type: String, required: true, maxlength: 100 },
        value: { type: Schema.Types.Mixed, required: true },
        unit: { type: String, maxlength: 20 },
        group: { type: String, maxlength: 50 },
        isVisible: { type: Boolean, default: true }
      }
    ],

    // Кастомные атрибуты
    customAttributes: {
      type: Schema.Types.Mixed,
      default: {}
    },

    // Связанные товары
    relatedProducts: [
      {
        type: Types.ObjectId,
        ref: "Product"
      }
    ],

    // Cross-sell/Up-sell товары
    upsellProducts: [
      {
        type: Types.ObjectId,
        ref: "Product"
      }
    ],
    crossSellProducts: [
      {
        type: Types.ObjectId,
        ref: "Product"
      }
    ],

    // Дополнительная информация
    weight: { 
      type: Number, 
      min: [0, 'Вес не может быть отрицательным'],
      max: [100000, 'Вез не может превышать 100000 грамм']
    },
    dimensions: {
      length: { type: Number, min: 0, max: 10000 },
      width: { type: Number, min: 0, max: 10000 },
      height: { type: Number, min: 0, max: 10000 }
    },
    manufacturer: { type: String, maxlength: 100 },
    warrantyMonths: { type: Number, min: 0, max: 120 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    
    // Мета-информация
    metaTitle: { type: String, maxlength: 255 },
    metaDescription: { type: String, maxlength: 500 },
    keywords: [{ type: String, maxlength: 50 }],

    // Системные поля
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    publishedAt: Date,

    // Статистика
    viewsCount: {
      type: Number,
      default: 0,
      min: 0
    },
    purchasesCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.__v;
        delete ret.updatedAt;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Виртуальные поля

ProductSchema.virtual("finalPriceForIndividual").get(function () {
  if (!this.discount?.isActive) return this.priceForIndividual;

  const now = new Date();
  
  // Проверка срока действия скидки
  if (this.discount.validFrom && now < this.discount.validFrom) {
    return this.priceForIndividual;
  }
  if (this.discount.validUntil && now > this.discount.validUntil) {
    return this.priceForIndividual;
  }

  let finalPrice = this.priceForIndividual;

  if (this.discount.percentage > 0) {
    finalPrice = finalPrice * (1 - this.discount.percentage / 100);
  }

  if (this.discount.amount > 0) {
    finalPrice = Math.max(0, finalPrice - this.discount.amount);
  }

  return Math.round(finalPrice * 100) / 100;
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

// Функция для обработки одного документа
const processProductDocument = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  
  // Обработка mainImage (если есть)
  if (doc.mainImage && shouldProcessUrl(doc.mainImage)) {
    doc.mainImage = fileService.getFileUrl(doc.mainImage);
  }
  
  // Обработка массива images
  if (doc.images && Array.isArray(doc.images)) {
    doc.images = doc.images.map(image => {
      if (image && image.url && shouldProcessUrl(image.url)) {
        return {
          ...image,
          url: fileService.getFileUrl(image.url)
        };
      }
      return image;
    });
  }
  
  // Обработка инструкции
  if (doc.instruction && doc.instruction !== null && doc.instruction.url && shouldProcessUrl(doc.instruction.url)) {
    doc.instruction = {
      ...doc.instruction,
      url: fileService.getFileUrl(doc.instruction.url)
    };
  }
  
  // Дополнительно: обработка specifications если там есть изображения
  if (doc.specifications && Array.isArray(doc.specifications)) {
    doc.specifications = doc.specifications.map(spec => {
      if (spec.value && typeof spec.value === 'string' && shouldProcessUrl(spec.value)) {
        return {
          ...spec,
          value: fileService.getFileUrl(spec.value)
        };
      }
      return spec;
    });
  }
  
  return doc;
};

// Middleware для обработки результатов запросов
ProductSchema.post(['find', 'findOne', 'findById'], function(docs) {
  if (!docs) return docs;
  
  if (Array.isArray(docs)) {
    return docs.map(processProductDocument);
  }
  
  return processProductDocument(docs);
});

// Middleware для агрегации (чтобы работало с aggregate)
ProductSchema.post('aggregate', function(docs) {
  if (!docs || !Array.isArray(docs)) return docs;
  
  return docs.map(processProductDocument);
});

// Middleware для toJSON (если вызывается вручную)
ProductSchema.methods.toJSON = function() {
  const obj = this.toObject ? this.toObject() : this;
  return processProductDocument(obj);
};


// Индексы
ProductSchema.index({ sku: 1 }, { unique: true });
ProductSchema.index({ status: 1, isVisible: 1 });
ProductSchema.index({ category: 1, status: 1, isVisible: 1 });
ProductSchema.index({ title: "text", description: "text", sku: "text" });
ProductSchema.index({ priceForIndividual: 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ showOnMainPage: 1, isVisible: 1 });

// Middleware
ProductSchema.pre("save", function (next) {
  // Автоматическое обновление publishedAt при публикации
  if (this.isModified('isVisible') && this.isVisible && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Статические методы
ProductSchema.statics.findAvailable = function() {
  return this.find({
    status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
    isVisible: true
  });
};

// Методы экземпляра
ProductSchema.methods.incrementViews = function() {
  this.viewsCount += 1;
  return this.save();
};

ProductSchema.methods.incrementPurchases = function(quantity = 1) {
  this.purchasesCount += quantity;
  return this.save();
};

// Дополнительные статические методы с автоматической обработкой
ProductSchema.statics.findWithProcessedUrls = async function(...args) {
  const docs = await this.find(...args);
  return Array.isArray(docs) ? docs.map(processProductDocument) : processProductDocument(docs);
};

ProductSchema.statics.findOneWithProcessedUrls = async function(...args) {
  const doc = await this.findOne(...args);
  return processProductDocument(doc);
};

ProductSchema.statics.findByIdWithProcessedUrls = async function(id, ...args) {
  const doc = await this.findById(id, ...args);
  return processProductDocument(doc);
};


module.exports = model("Product", ProductSchema);
module.exports.ProductStatus = ProductStatus;