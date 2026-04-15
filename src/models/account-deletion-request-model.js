const { Schema, model } = require("mongoose");

const actionSchema = new Schema({
  action: { type: String, required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  timestamp: { type: Date, default: Date.now },
  details: { type: Schema.Types.Mixed },
});

const twoFactorVerificationSchema = new Schema({
  enabled: { type: Boolean, default: false },
  codeHash: { type: String, default: null },
  codeExpiresAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  verifiedAt: { type: Date, default: null },
});

const verificationDataSchema = new Schema({
  email: { type: String, default: null },
  phone: { type: String, default: null },
  name: { type: String, default: null },
});

const unregisteredUserDataSchema = new Schema({
  ip: { type: String, default: null },
  deviceId: { type: String, default: null },
  cookies: { type: Schema.Types.Mixed, default: null },
});

const requestDocumentSchema = new Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  generatedAt: { type: Date, default: Date.now },
  hash: { type: String, required: true },
});

const AccountDeletionRequestSchema = new Schema(
  {
    // Основные поля
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "pending_verification",
        "verified",
        "waiting_period",
        "processing",
        "completed",
        "cancelled",
        "rejected",
      ],
      default: "pending",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },

    // Новые поля для расширенной логики
    requestType: {
      type: String,
      enum: [
        "account_deletion",
        "data_anonymization",
        "consent_withdrawal",
        "data_access",
        "data_correction",
      ],
      default: "account_deletion",
    },
    userType: {
      type: String,
      enum: ["registered", "unregistered"],
      default: "registered",
    },
    verificationData: {
      type: verificationDataSchema,
      default: () => ({}),
    },
    unregisteredUserData: {
      type: unregisteredUserDataSchema,
      default: null,
    },
    userComments: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    verificationMethod: {
      type: String,
      enum: ["email", "sms", "app", "none"],
      default: "email",
    },
    twoFactorCompleted: {
      type: Boolean,
      default: false,
    },
    twoFactorVerification: {
      type: twoFactorVerificationSchema,
      default: () => ({}),
    },
    verificationDate: {
      type: Date,
      default: null,
    },
    waitPeriodStart: {
      type: Date,
      default: null,
    },
    waitPeriodEnd: {
      type: Date,
      default: null,
    },
    cancellationToken: {
      type: String,
      default: null,
    },
    cancellationTokenExpires: {
      type: Date,
      default: null,
    },
    actions: [actionSchema],
    documents: [requestDocumentSchema],
    cancellationDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Автоматически ставим expiresAt = +14 дней, если не указано
AccountDeletionRequestSchema.pre("save", function (next) {
  if (!this.expiresAt) {
    const expires = new Date();
    expires.setDate(expires.getDate() + 14);
    this.expiresAt = expires;
  }
  next();
});

module.exports = model("AccountDeletionRequest", AccountDeletionRequestSchema);
