const mongoose = require("mongoose");

const VersionSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      match: /^\d+\.\d+\.\d+$/, // Формат: major.minor.patch
    },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    publishedAt: Date,
    changes: [
      {
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        description: String,
      },
    ],
    checksum: String, // SHA-256 хеш контента
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
    isRequired: { type: Boolean, default: true },
    currentPublished: { type: mongoose.Schema.Types.ObjectId },
    versions: [VersionSchema],
  },
  { timestamps: true }
);

// Автоматическая генерация checksum
VersionSchema.pre("save", function (next) {
  if (this.isModified("content")) {
    const crypto = require("crypto");
    this.checksum = crypto
      .createHash("sha256")
      .update(this.content)
      .digest("hex");
  }
  next();
});

module.exports = mongoose.model("Consent", ConsentSchema);
