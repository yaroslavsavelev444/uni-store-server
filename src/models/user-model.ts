import { model, Schema, type Types } from "mongoose";
import type {
  IUser,
  IUserMethods,
  IUserModel,
  UserDocument,
} from "../types/user.types.js";
import { normalizeEmail } from "../utils/normalizers.js";
import cartModel from "./cart-model.js";

const UserSchema = new Schema<IUser, IUserModel, IUserMethods>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      set: normalizeEmail,
      validate: {
        validator: (v: string) => {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props: any) =>
          `${props.value} не является корректным email адресом!`,
      },
    },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      required: true,
    },
    name: { type: String, required: true },
    activations: {
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
    status: {
      type: String,
      enum: ["active", "blocked", "suspended"],
      default: "active",
      index: true,
    },
    blockedUntil: {
      type: Date,
      default: null,
      index: true,
    },
    lastSanction: {
      type: Schema.Types.ObjectId,
      ref: "UserSanction",
      default: null,
    },
  },
  { timestamps: true },
);

// Middleware для создания корзины
UserSchema.post("save", async (doc: UserDocument) => {
  const cartExists = await cartModel.exists({ user: doc._id });
  if (!cartExists) {
    const newCart = new cartModel({ user: doc._id, items: [] });
    await newCart.save();
  }
});

// Статический метод для проверки, заблокирован ли пользователь
UserSchema.statics.isUserBlocked = async function (
  this: IUserModel,
  userId: string | Types.ObjectId,
): Promise<boolean> {
  const user = await this.findById(userId).select("status blockedUntil");

  if (!user) return false;

  if (user.status === "active") return false;

  if (user.blockedUntil && user.blockedUntil < new Date()) {
    // Срок блокировки истёк, разблокируем пользователя
    user.status = "active";
    user.blockedUntil = null;
    user.lastSanction = null;
    await user.save();
    return false;
  }

  return user.status === "blocked";
};

export default model<IUser, IUserModel>("User", UserSchema);
