const { Schema, model, Types } = require("mongoose");

const RefundStatus = {
  PENDING: "pending",     // Ожидает рассмотрения
  PROCESSING: "processing", // В обработке
  APPROVED: "approved",   // Одобрено
  REJECTED: "rejected",   // Отклонено
  COMPLETED: "completed", // Завершено (деньги возвращены)
  CLOSED: "closed"        // Закрыто
};

const RefundReason = {
  DEFECTIVE: "defective",         // Бракованный товар
  WRONG_ITEM: "wrong_item",       // Не тот товар
  DAMAGED: "damaged",             // Поврежден при доставке
  NOT_AS_DESCRIBED: "not_as_described", // Не соответствует описанию
  LATE_DELIVERY: "late_delivery", // Опоздание доставки
  CHANGE_OF_MIND: "change_of_mind", // Передумал
  OTHER: "other"                  // Другое
};

const RefundSchema = new Schema(
  {
    // Основная информация
    orderId: {
      type: Types.ObjectId,
      ref: "Order",
      required: [true, "ID заказа обязателен"],
      index: true
    },
    orderNumber: {
      type: String,
      required: [true, "Номер заказа обязателен"],
      trim: true,
      index: true
    },
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: [true, "ID пользователя обязательно"],
      index: true
    },
    userEmail: {
      type: String,
      required: [true, "Email пользователя обязателен"],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Некорректный email"]
    },

    // Информация о товарах
    items: [
      {
        productId: {
          type: Types.ObjectId,
          ref: "Product",
          required: true
        },
        reason: {
          type: String,
          enum: {
            values: Object.values(RefundReason),
            message: "Некорректная причина возврата"
          },
          required: true
        },
        reasonDetails: {
          type: String,
          maxlength: 500
        },
        isDefective: {
          type: Boolean,
          default: false
        },
        defectDescription: {
          type: String,
          maxlength: 500
        }
      }
    ],

    // Общая информация о возврате
    totalAmount: {
      type: Number,
      required: [true, "Общая сумма возврата обязательна"],
      min: [0, "Сумма не может быть отрицательной"],
      max: [1000000, "Сумма не может превышать 1 000 000"]
    },
    refundAmount: {
      type: Number,
      min: [0, "Сумма возврата не может быть отрицательной"],
      default: 0
    },
    currency: {
      type: String,
      default: "RUB",
      uppercase: true
    },

    // Статус и причины
    status: {
      type: String,
      enum: {
        values: Object.values(RefundStatus),
        message: "Некорректный статус возврата"
      },
      default: RefundStatus.PENDING
    },
    reason: {
      type: String,
      enum: {
        values: Object.values(RefundReason),
        message: "Некорректная причина возврата"
      },
      required: [true, "Причина возврата обязательна"]
    },
    description: {
      type: String,
      required: [true, "Описание обязательно"],
      minlength: [10, "Описание должно содержать минимум 10 символов"],
      maxlength: [2000, "Описание должно содержать максимум 2000 символов"]
    },

    // Медиафайлы
    media: [
      {
        url: {
          type: String,
          required: true,
          validate: {
            validator: function(v) {
              return /^(https?:\/\/|\/uploads\/)/.test(v);
            },
            message: "Некорректный формат ссылки на файл"
          }
        },
        type: {
          type: String,
          enum: ["image", "video", "document"],
          default: "image"
        },
        originalName: {
          type: String,
          maxlength: 255
        },
        size: {
          type: Number,
          min: 0,
          max: 50 * 1024 * 1024 // 50MB
        },
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // Информация о доставке
    shippingMethod: {
      type: String,
      trim: true
    },
    trackingNumber: {
      type: String,
      trim: true
    },
    estimatedDeliveryDate: {
      type: Date
    },

    // Комментарии и решения
    adminNotes: [
      {
        note: {
          type: String,
          required: true,
          maxlength: 1000
        },
        adminId: {
          type: Types.ObjectId,
          ref: "User",
          required: true
        },
        adminName: {
          type: String,
          required: true
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    rejectionReason: {
      type: String,
      maxlength: 500
    },
    resolutionNotes: {
      type: String,
      maxlength: 1000
    },

    // Информация о возврате денег
    refundMethod: {
      type: String,
      enum: ["original_payment", "bank_transfer", "credit", "other"],
      default: "original_payment"
    },
    refundTransactionId: {
      type: String,
      trim: true
    },
    refundedAt: {
      type: Date
    },

    // Системные поля
    createdBy: {
      type: Types.ObjectId,
      ref: "User"
    },
    updatedBy: {
      type: Types.ObjectId,
      ref: "User"
    },
    assignedTo: {
      type: Types.ObjectId,
      ref: "User"
    },
    priority: {
      type: Number,
      enum: [1, 2, 3, 4, 5], // 1 - самый высокий
      default: 3
    },

    // Статистика и метаданные
    responseTime: {
      type: Number, // в часах
      min: 0
    },
    customerSatisfaction: {
      type: Number,
      min: 1,
      max: 5
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],

    // Сроки
    estimatedCompletionDate: {
      type: Date
    },
    dueDate: {
      type: Date
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
RefundSchema.virtual("isOverdue").get(function() {
  if (!this.dueDate) return false;
  return new Date() > this.dueDate && 
         ["pending", "processing"].includes(this.status);
});

RefundSchema.virtual("daysOpen").get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

RefundSchema.virtual("formattedStatus").get(function() {
  const statusMap = {
    [RefundStatus.PENDING]: "Ожидает рассмотрения",
    [RefundStatus.PROCESSING]: "В обработке",
    [RefundStatus.APPROVED]: "Одобрено",
    [RefundStatus.REJECTED]: "Отклонено",
    [RefundStatus.COMPLETED]: "Завершено",
    [RefundStatus.CLOSED]: "Закрыто"
  };
  return statusMap[this.status] || this.status;
});

RefundSchema.virtual("formattedReason").get(function() {
  const reasonMap = {
    [RefundReason.DEFECTIVE]: "Бракованный товар",
    [RefundReason.WRONG_ITEM]: "Не тот товар",
    [RefundReason.DAMAGED]: "Поврежден при доставке",
    [RefundReason.NOT_AS_DESCRIBED]: "Не соответствует описанию",
    [RefundReason.LATE_DELIVERY]: "Опоздание доставки",
    [RefundReason.CHANGE_OF_MIND]: "Передумал",
    [RefundReason.OTHER]: "Другое"
  };
  return reasonMap[this.reason] || this.reason;
});

// Индексы
RefundSchema.index({ orderId: 1, status: 1 });
RefundSchema.index({ userId: 1, createdAt: -1 });
RefundSchema.index({ status: 1, priority: 1, createdAt: 1 });
RefundSchema.index({ orderNumber: "text", userEmail: "text" });
RefundSchema.index({ createdAt: -1 });
RefundSchema.index({ dueDate: 1, status: 1 });
RefundSchema.index({ assignedTo: 1, status: 1 });

// Middleware
RefundSchema.pre("save", function(next) {
  // Автоматическое назначение dueDate если не установлено
  if (!this.dueDate && ["pending", "processing"].includes(this.status)) {
    const dueDate = new Date(this.createdAt);
    dueDate.setDate(dueDate.getDate() + 14); // 14 дней на обработку
    this.dueDate = dueDate;
  }
  
  // Рассчет общего количества товаров
  if (this.isModified("items") && this.items.length > 0) {
    this.totalAmount = this.items.reduce((sum, item) => {
      return sum + (item.pricePerUnit * item.quantity);
    }, 0);
  }
  
  next();
});

// Статические методы
RefundSchema.statics.findByOrder = function(orderId) {
  return this.find({ orderId }).sort({ createdAt: -1 });
};

RefundSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

RefundSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" }
      }
    },
    {
      $project: {
        status: "$_id",
        count: 1,
        totalAmount: 1,
        _id: 0
      }
    }
  ]);
  
  return stats;
};

// Методы экземпляра
RefundSchema.methods.addAdminNote = function(note, adminId, adminName) {
  this.adminNotes.push({
    note,
    adminId,
    adminName,
    createdAt: new Date()
  });
  return this.save();
};

RefundSchema.methods.updateStatus = async function(newStatus, adminId, notes = "") {
  const oldStatus = this.status;
  this.status = newStatus;
  this.updatedBy = adminId;
  
  if (notes) {
    await this.addAdminNote(
      `Статус изменен с "${oldStatus}" на "${newStatus}". ${notes}`,
      adminId,
      "Система"
    );
  }
  
  // Устанавливаем дату завершения если статус завершен
  if (["completed", "closed", "rejected"].includes(newStatus)) {
    this.refundedAt = new Date();
  }
  
  return this.save();
};

RefundSchema.methods.assignToAdmin = function(adminId, adminName) {
  this.assignedTo = adminId;
  this.addAdminNote(
    `Заявка назначена администратору: ${adminName}`,
    adminId,
    "Система"
  );
  return this.save();
};

module.exports = model("Refund", RefundSchema);
module.exports.RefundStatus = RefundStatus;
module.exports.RefundReason = RefundReason;