// models/pickup-point.model.js
const { Schema, model } = require("mongoose");

const PickupPointSchema = new Schema(
  {
    // Основная информация
    name: {
      type: String,
      required: true,
      trim: true
    },
    
    // Упрощенный адрес
    address: {
      street: {
        type: String,
        required: true,
        trim: true
      },
      city: {
        type: String,
        required: true,
        trim: true
      },
      postalCode: {
        type: String,
        trim: true
      },
      country: {
        type: String,
        default: "Россия",
        trim: true
      }
    },
    
    // Координаты (опционально)
    coordinates: {
      lat: Number,
      lng: Number
    },
    
    // Рабочее время
    workingHours: {
      type: String,
      default: "Пн-Пт: 9:00-18:00"
    },
    
    // Контактная информация
    contact: {
      phone: String,
      email: String
    },
    
    // Описание/комментарий
    description: String,
    
    // Статус и флаги
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isMain: {
      type: Boolean,
      default: false,
      index: true
    },
    
    // Метаданные
    orderIndex: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Индекс для поиска
PickupPointSchema.index({ "address.city": 1, isActive: 1 });
PickupPointSchema.index({ isMain: 1, isActive: 1 });

// Предварительная валидация: только один главный пункт
PickupPointSchema.pre("save", async function(next) {
  if (this.isMain && this.isModified("isMain")) {
    try {
      // Сбрасываем isMain у других пунктов
      await this.constructor.updateMany(
        { _id: { $ne: this._id }, isMain: true },
        { isMain: false }
      );
    } catch (error) {
      return next(error);
    }
  }
  next();
});

module.exports = model("PickupPoint", PickupPointSchema);
