const { Schema, model } = require("mongoose");

const UserSecuritySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    twoFACodeHash: { type: String, default: null },
    twoFACodeExpiresAt: { type: Date, default: null },
    twoFAAttempts: { type: Number, default: 0 },
    resetTokenExpiration: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenStatus: { type: String, default: 'pending' },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

UserSecuritySchema.index({ userId: 1 }, { unique: true });

module.exports = model("UserSecurity", UserSecuritySchema);
