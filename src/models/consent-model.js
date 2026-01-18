const mongoose = require("mongoose");
const { sanitizeHtml } = require("../utils/sanitizer");
const VersionHistorySchema = new mongoose.Schema(
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
        validator: function (v) {
          if (!v) return true;
          return /^(https?:\/\/)[^\s$.?#].[^\s]*$/.test(v);
        },
        message: (props) => `${props.value} не является валидным URL`,
      },
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changeDescription: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ConsentSchema = new mongoose.Schema(
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
        validator: function (v) {
          if (!v) return true;
          return /^(https?:\/\/)[^\s$.?#].[^\s]*$/.test(v);
        },
        message: (props) => `${props.value} не является валидным URL`,
      },
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    needsAcceptance: {
      type: Boolean,
      default: true,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    version: {
      type: String,
      default: "1.0.0",
      match: /^\d+\.\d+\.\d+$/,
    },
    history: [VersionHistorySchema],
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ConsentSchema.pre("validate", function (next) {
  const fieldsToSanitize = ["title", "description", "content"];

  fieldsToSanitize.forEach((field) => {
    if (this.isModified(field) && this[field]) {
      this[field] = sanitizeHtml(this[field]);
    }
  });

  // история версий
  if (this.history?.length) {
    this.history.forEach((h) => {
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
// Предварительная обработка для сохранения истории
ConsentSchema.pre("save", function (next) {
  const crypto = require("crypto");

  // Если это обновление существующего соглашения и изменилось содержание или URL
  if (
    !this.isNew &&
    (this.isModified("content") || this.isModified("documentUrl"))
  ) {
    // Сохраняем текущую версию в историю перед обновлением
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

    // Увеличиваем версию (patch)
    const [major, minor, patch] = this.version.split(".").map(Number);
    this.version = `${major}.${minor}.${patch + 1}`;

    // Обновляем хеш контента
    this.checksum = crypto
      .createHash("sha256")
      .update(this.content)
      .digest("hex");

    // Обновляем дату изменения
    this.lastUpdatedAt = new Date();
  }

  next();
});

// Виртуальное поле для получения активного соглашения
ConsentSchema.virtual("isPublished").get(function () {
  return this.isActive;
});

module.exports = mongoose.model("Consent", ConsentSchema);
