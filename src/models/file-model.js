const crypto = require("crypto");
const { Schema, model } = require("mongoose");
const FileManager = require("../utils/fileManager.js");

/**
 * ====================== СХЕМА ======================
 */

const FileSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    accessType: {
      type: String,
      enum: ["public", "private", "restricted"],
      required: true,
      index: true,
    },

    entityType: {
      type: String,
      enum: ["chat", "product", "feedback", null],
      default: null,
    },

    allowedUsers: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },

    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    originalName: { type: String, required: true },
    storedName: { type: String, required: true },

    storagePath: { type: String, required: true, unique: true },

    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },

    isCompressed: { type: Boolean, default: true },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/**
 * ====================== VIRTUAL ======================
 */
FileSchema.virtual("url").get(function () {
  return FileManager.getFileUrl(`/files/${this._id}`);
});

/**
 * ====================== HELPERS ======================
 */
const processFileDocument = (doc) => {
  if (!doc) return doc;
  if (!doc.url && doc._id) {
    doc.url = FileManager.getFileUrl(`/files/${doc._id}`);
  }
  return doc;
};

/**
 * ====================== HOOKS ======================
 */
FileSchema.post("find", (docs) => docs.map(processFileDocument));
FileSchema.post("findOne", (doc) => processFileDocument(doc));
FileSchema.post("findById", (doc) => processFileDocument(doc));
FileSchema.post("aggregate", (docs) => {
  if (Array.isArray(docs)) return docs.map(processFileDocument);
  return processFileDocument(docs);
});

/**
 * ====================== METHODS ======================
 */
FileSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return processFileDocument(obj);
};

/**
 * ====================== STATICS ======================
 */
FileSchema.statics.findByIdForUser = async function (fileId, userId) {
  return this.findOne({
    _id: fileId,
    deletedAt: null,
  });
};

/**
 * ====================== INDEXES ======================
 */
FileSchema.index({ ownerId: 1, accessType: 1 });
FileSchema.index({ entityType: 1, entityId: 1 });
FileSchema.index({ accessType: 1 });

/**
 * ====================== MODEL ======================
 */
module.exports = model("File", FileSchema);
