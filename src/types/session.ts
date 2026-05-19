// types/session.ts (новый файл)
import type { Types } from "mongoose";
import type { IUserSession, RevokedReason } from "./userSession.types.js";

export interface SessionInvalidationResult {
  invalidatedCount: number;
  keptCurrent: boolean;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  revokedSessions: number;
  blacklistCount: number;
  tempBlacklistCount: number;
  redisHealth: boolean;
}

export interface SessionWithRevokedStatus extends IUserSession {
  isRevoked: boolean;
}

export interface BulkBlacklistResult {
  successCount: number;
  results: any[];
}

export type RedisOperation<T = any> = () => Promise<T>;

export interface SessionFilter {
  userId: Types.ObjectId | string;
  revoked: boolean;
  _id?: { $ne: Types.ObjectId | string };
}

export interface UpdateSessionData {
  revoked: boolean;
  revokedAt: Date;
  revokedReason: RevokedReason;
}
