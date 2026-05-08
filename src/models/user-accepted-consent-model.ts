// models/user-accepted-consent-model.js
const { Schema, model } = require("mongoose");

const UserAcceptedConsentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    consentSlug: {
      type: String,
      required: true,
      index: true,
    },
    consentVersion: {
      type: String,
      required: true,
    },
    acceptedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ip: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
  },
  { timestamps: false }
);

// Один пользователь не может дважды принять одну и ту же версию
UserAcceptedConsentSchema.index(
  { userId: 1, consentSlug: 1, consentVersion: 1 },
  { unique: true }
);

module.exports = model(
  "UserAcceptedConsent",
  UserAcceptedConsentSchema
);