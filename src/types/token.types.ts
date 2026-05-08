import type { HydratedDocument, Model, Types } from "mongoose";

export interface IToken {
  user?: Types.ObjectId;
  refreshToken: string;
}

export type ITokenVirtuals = {};

export type ITokenMethods = {};

export interface TokenModelType extends Model<IToken, {}, ITokenMethods> {}

export type HydratedToken = HydratedDocument<IToken>;
