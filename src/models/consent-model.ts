import crypto from "node:crypto";
import { model, Schema } from "mongoose";
import type {
  ConsentDocument,
  IConsent,
  IConsentMethods,
  IConsentModel,
  IVersionHistory,
} from "../types/consent.types.js";
import { sanitizeHtml } from "../utils/sanitizer.js";

// Схема истории версий (вложенная)
const VersionHistorySchema = new Schema<IVersionHistory>(
  {
    version: {
      type: String,
      required: true,
      match: /^\d+\.\d+\.\d+$/,
    },
    content: { type: String, required: true },
    documentUrl: {
      type: String,
      validate: {
        validator: (v: string) => {
          if (!v) return true;
          return /^(https?:\/\/)[^\s$.?#].[^\s]*$/.test(v);
        },
        message: (props: any) => `${props.value} не является валидным URL`,
      },
    },
    author: { type: Schema.Types.ObjectId, ref: "User" },
    changeDescription: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// Основная схема Consent – три дженерика
const ConsentSchema = new Schema<IConsent, IConsentModel, IConsentMethods>(
  {
    title: { type: String, required: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      match: /^[a-z0-9_-]+$/i,
    },
    description: String,
    content: { type: String, required: true },
    documentUrl: {
      type: String,
      validate: {
        validator: (v: string) => {
          if (!v) return true;
          return /^(https?:\/\/)[^\s$.?#].[^\s]*$/.test(v);
        },
        message: (props: any) => `${props.value} не является валидным URL`,
      },
    },
    isRequired: { type: Boolean, default: true },
    needsAcceptance: { type: Boolean, default: true, required: true },
    isActive: { type: Boolean, default: true, required: true },
    version: { type: String, default: "1.0.0", match: /^\d+\.\d+\.\d+$/ },
    history: [VersionHistorySchema],
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastUpdatedAt: { type: Date, default: Date.now },
    // служебные поля (не сохраняются, используются в хуках)
    _originalContent: { type: String, select: false },
    _originalDocumentUrl: { type: String, select: false },
    _originalLastUpdatedBy: { type: Schema.Types.ObjectId, select: false },
    _originalChangeDescription: { type: String, select: false },
    checksum: { type: String, select: false },
  },
  { timestamps: true },
);

// Pre-validate: санитизация HTML
ConsentSchema.pre("validate", function (this: ConsentDocument, next) {
  const fieldsToSanitize = ["title", "description", "content"];

  fieldsToSanitize.forEach((field) => {
    if (this.isModified(field) && (this as any)[field]) {
      (this as any)[field] = sanitizeHtml((this as any)[field]);
    }
  });

  if (this.history?.length) {
    this.history.forEach((h: IVersionHistory) => {
      if (h.content) {
        h.content = sanitizeHtml(h.content);
      }
      if (h.changeDescription) {
        h.changeDescription = sanitizeHtml(h.changeDescription);
      }
    });
  }

  next();
});

// Pre-save: сохранение истории и обновление версии
ConsentSchema.pre("save", function (this: ConsentDocument, next) {
  if (
    !this.isNew &&
    (this.isModified("content") || this.isModified("documentUrl"))
  ) {
    if (this.history) {
      this.history.push({
        version: this.version,
        content: this._originalContent || this.content,
        documentUrl: this._originalDocumentUrl || this.documentUrl,
        author: this._originalLastUpdatedBy || this.lastUpdatedBy,
        changeDescription:
          this._originalChangeDescription ||
          "Автоматическое сохранение истории",
      });
    }

    // Увеличиваем patch-версию
    const [major, minor, patch] = this.version.split(".").map(Number);
    this.version = `${major}.${minor}.${patch + 1}`;

    this.checksum = crypto
      .createHash("sha256")
      .update(this.content)
      .digest("hex");
    this.lastUpdatedAt = new Date();
  }

  next();
});

// Виртуальное поле isPublished – не дублируется в IConsent
ConsentSchema.virtual("isPublished").get(function (this: ConsentDocument) {
  return this.isActive;
});

// Экспорт модели
export default model<IConsent, IConsentModel>("Consent", ConsentSchema);
