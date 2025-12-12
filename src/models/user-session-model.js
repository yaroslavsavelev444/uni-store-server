const { Schema, model } = require("mongoose");

const UserSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refreshToken: { type: String, required: true },
    deviceId: { type: String, default: null }, 
    deviceType: { type: String, default: null },
    deviceModel: { type: String, default: null },
    os: { type: String, default: null },
    osVersion: { type: String, default: null },
    ip: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },

    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    revokedReason: { 
      type: String, 
      enum: [
        'password_changed_all_sessions',
        'password_changed_other_sessions', 
        'manually_revoked',
        'suspicious_activity',
        'force_logout'
      ],
      default: null 
    },
    
  },
  {
    versionKey: false,
  }
);

UserSessionSchema.index({ userId: 1 });
UserSessionSchema.index({ refreshToken: 1 }, { unique: true });
UserSessionSchema.index(
  { userId: 1, deviceId: 1 },
  { unique: false } 
);

module.exports = model("UserSession", UserSessionSchema);
