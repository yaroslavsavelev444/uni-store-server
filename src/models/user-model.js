const { Schema, model } = require("mongoose");
const cartModel = require("./cart-model");

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      required: true,
    },
    name: { type: String, required: true },
    activations: {
      emailVerified: { type: Boolean, default: false },
      emailToken: { type: String, select: false },
      emailTokenExpiration: { type: Date },
    },

    tokens: {
      resetToken: { type: String, default: null, select: false },
      resetTokenStatus: {
        type: String,
        enum: ["pending", "verified", null],
        default: "pending",
      },
      resetTokenExpiration: { type: Date, default: null },
    },
    passwordChangeHistory: {
      type: [
        {
          timestamp: { type: Date, default: Date.now },
          ip: { type: String, required: true },
        },
      ],
      select: false,
    },
  },
  { timestamps: true }
);

UserSchema.post("save", async function (doc) {
  const cartExists = await cartModel.exists({ user: doc._id });
  if (!cartExists) {
    const newCart = new cartModel({ user: doc._id, items: [] });
    await newCart.save();
  }
});

module.exports = model("User", UserSchema);
