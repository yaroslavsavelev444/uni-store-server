import { model, Schema, Types } from "mongoose";
import type { IToken, TokenModelType } from "../types/token.types.js";

const TokenSchema = new Schema<IToken, TokenModelType>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    refreshToken: { type: String, required: true },
  },
  // без timestamps
);

export default model<IToken, TokenModelType>("Token", TokenSchema);
