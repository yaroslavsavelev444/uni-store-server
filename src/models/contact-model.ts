import { model, Schema } from "mongoose";
import { EMAIL_REGEX, PHONE_REGEX, URL_REGEX } from "../constants/regex.js";
import type {
  ContactModelType,
  IContact,
  IContactDocument,
  IEmail,
} from "../types/contact.types.js";

const contactSchema = new Schema<IContact, ContactModelType, IContactMethods>(
  {
    companyName: {
      type: String,
      required: [true, "Название компании обязательно"],
      trim: true,
      maxlength: [200, "Название компании не может превышать 200 символов"],
    },
    legalAddress: {
      type: String,
      trim: true,
      maxlength: [500, "Юридический адрес не может превышать 500 символов"],
    },
    physicalAddress: {
      type: String,
      trim: true,
      maxlength: [500, "Физический адрес не может превышать 500 символов"],
    },
    phones: [
      {
        type: {
          type: String,
          enum: ["support", "sales", "general", "fax", "accounting", "other"],
          default: "general",
        },
        value: {
          type: String,
          required: [true, "Номер телефона обязателен"],
          trim: true,
          match: [PHONE_REGEX, "Неверный формат телефона"],
        },
        description: {
          type: String,
          trim: true,
          maxlength: [100, "Описание не может превышать 100 символов"],
        },
        isPrimary: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 },
      },
    ],
    emails: [
      {
        type: {
          type: String,
          enum: ["support", "info", "sales", "security", "hr", "other"],
          default: "general",
        },
        value: {
          type: String,
          required: [true, "Email обязателен"],
          trim: true,
          lowercase: true,
          match: [EMAIL_REGEX, "Неверный формат email"],
        },
        description: {
          type: String,
          trim: true,
          maxlength: [100, "Описание не может превышать 100 символов"],
        },
        isPrimary: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 },
      },
    ],
    socialLinks: [
      {
        platform: {
          type: String,
          required: [true, "Платформа обязательна"],
          enum: ["telegram", "whatsapp", "vk", "github", "max", "other"],
        },
        url: {
          type: String,
          required: [true, "URL обязателен"],
          trim: true,
          match: [URL_REGEX, "Неверный формат URL"],
        },
        title: {
          type: String,
          trim: true,
          maxlength: [100, "Название не может превышать 100 символов"],
        },
        sortOrder: { type: Number, default: 0 },
      },
    ],
    otherContacts: [
      {
        type: {
          type: String,
          enum: ["messenger", "forum", "custom", "chat", "bot"],
          required: true,
        },
        name: {
          type: String,
          required: [true, "Название обязательно"],
          trim: true,
          maxlength: [100, "Название не может превышать 100 символов"],
        },
        value: {
          type: String,
          required: [true, "Значение обязательно"],
          trim: true,
        },
        description: {
          type: String,
          trim: true,
          maxlength: [200, "Описание не может превышать 200 символов"],
        },
        sortOrder: { type: Number, default: 0 },
      },
    ],
    workingHours: {
      type: String,
      trim: true,
      maxlength: [500, "Время работы не может превышать 500 символов"],
    },
    isActive: { type: Boolean, default: true },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    version: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret._id;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// Pre-save: удаление дубликатов и сортировка
contactSchema.pre("save", function (this: IContactDocument, next) {
  // Убираем дубликаты телефонов (по значению без форматирования)
  if (this.phones && this.phones.length > 0) {
    const phoneMap = new Map<string, boolean>();
    this.phones = this.phones.filter((phone: IPhone) => {
      const key = phone.value.replace(/\D/g, "");
      if (!phoneMap.has(key)) {
        phoneMap.set(key, true);
        return true;
      }
      return false;
    });
  }

  // Убираем дубликаты email
  if (this.emails && this.emails.length > 0) {
    const emailMap = new Map<string, boolean>();
    this.emails = this.emails.filter((email: IEmail) => {
      const key = email.value.toLowerCase();
      if (!emailMap.has(key)) {
        emailMap.set(key, true);
        return true;
      }
      return false;
    });
  }

  // Сортируем массивы по sortOrder
  (["phones", "emails", "socialLinks", "otherContacts"] as const).forEach(
    (field) => {
      if (this[field] && this[field].length > 0) {
        this[field] = this[field].sort(
          (a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0),
        );
      }
    },
  );

  next();
});

export default model<IContactDocument, ContactModelType>(
  "Contact",
  contactSchema,
);
