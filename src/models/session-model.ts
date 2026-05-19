import { model, Schema, Types } from "mongoose";
import type {
  ISession,
  ISessionMethods,
  ISessionModel,
  SessionDocument,
} from "../types/session.types.js";

const SessionSchema = new Schema<ISession, ISessionModel, ISessionMethods>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refreshToken: { type: String, required: true },
    userAgent: { type: String },
    ip: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  // без timestamps, т.к. createdAt определён явно
);

export default model<ISession, ISessionModel>("Session", SessionSchema);
