import type { HydratedDocument, Model, Types } from "mongoose";

export interface ISession {
  user: Types.ObjectId;
  refreshToken: string;
  userAgent?: string;
  ip?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

export type ISessionVirtuals = {};

export type ISessionMethods = {};

export interface SessionModelType extends Model<
  ISession,
  {},
  ISessionMethods
> {}

export type HydratedSession = HydratedDocument<ISession>;
