import { model, Schema, Types } from "mongoose";
import type {
  IToken,
  ITokenMethods,
  ITokenModel,
  TokenDocument,
} from "../types/token.types.js";

const TokenSchema = new Schema<IToken, ITokenModel, ITokenMethods>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    refreshToken: { type: String, required: true },
  },
  // без timestamps
);

export default model<IToken, ITokenModel>("Token", TokenSchema);
