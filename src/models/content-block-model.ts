// contentBlock.model.ts
import { model, Schema } from "mongoose";
import xss from "xss";
import type {
  ContentBlockModel,
  IContentBlockDocument,
} from "../types/contentBlock.types.js";

const contentBlockSchema = new Schema<IContentBlockDocument>(
  {
    title: {
      type: String,
      required: [true, "Заголовок обязателен"],
      trim: true,
      maxlength: [200, "Заголовок не должен превышать 200 символов"],
    },
    subtitle: {
      type: String,
      required: [true, "Подзаголовок обязателен"],
      trim: true,
      maxlength: [500, "Подзаголовок не должен превышать 500 символов"],
    },
    imageUrl: {
      type: String,
      ref: "File",
      default: null,
    },
    button: {
      text: {
        type: String,
        trim: true,
        maxlength: [50, "Текст кнопки не должен превышать 50 символов"],
        default: null,
      },
      action: {
        type: String,
        trim: true,
        maxlength: [500, "Действие кнопки не должно превышать 500 символов"],
        default: null,
        validate: {
          validator: (v: string | null) => {
            if (!v) return true;
            return (
              /^(https?:\/\/|\/)[^\s]+$/.test(v) || /^[a-zA-Z0-9_]+$/.test(v)
            );
          },
          message: "Некорректный формат действия кнопки",
        },
      },
      style: {
        type: String,
        enum: ["primary", "secondary", "outline", null],
        default: null,
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Описание не должно превышать 2000 символов"],
      default: "",
    },
    position: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete (ret as any).__v;
        return ret;
      },
    },
  },
);

// Pre-save: XSS и нормализация тегов
contentBlockSchema.pre("save", function (this: IContentBlockDocument, next) {
  this.updatedAt = new Date();

  if (this.title) this.title = xss(this.title);
  if (this.subtitle) this.subtitle = xss(this.subtitle);
  if (this.description) this.description = xss(this.description);
  if (this.button?.text) this.button.text = xss(this.button.text);

  if (this.tags) {
    this.tags = this.tags
      .filter((tag) => tag?.trim())
      .map((tag) => tag.trim().toLowerCase());
  }

  next();
});

// Индексы
contentBlockSchema.index({ position: 1, createdAt: -1 });
contentBlockSchema.index({ isActive: 1 });
contentBlockSchema.index({ tags: 1 });
contentBlockSchema.index({ createdAt: -1 });
contentBlockSchema.index({ createdBy: 1 });
contentBlockSchema.index({ updatedBy: 1 });

// Виртуальное поле hasButton
contentBlockSchema.virtual("hasButton").get(function (
  this: IContentBlockDocument,
) {
  return !!(this.button?.text && this.button.action);
});

// Метод toSafeObject
contentBlockSchema.methods.toSafeObject = function (
  this: IContentBlockDocument,
) {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

// Статический метод findActive (без преобразований)
contentBlockSchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({ position: 1, createdAt: -1 });
};

export default model<IContentBlockDocument, ContentBlockModel>(
  "ContentBlock",
  contentBlockSchema,
);
