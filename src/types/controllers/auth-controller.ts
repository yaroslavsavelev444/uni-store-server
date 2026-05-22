/** biome-ignore-all lint/complexity/noBannedTypes: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import type { Query } from "express-serve-static-core";
import type { AuthRequest, OptionalAuthRequest } from "../auth.js";
import type { UserDocument } from "../user.types.js";
import type { UserSessionDocument } from "../userSession.types.js";

// ========== Вспомогательные типы ==========
export interface DeviceInfoRequest {
  deviceType?: string;
  useragent?: {
    platform?: string;
    os?: string;
    version?: string;
  };
}

// ========== REGISTER ==========
export interface RegisterBody {
  email: string;
  password: string;
  name: string;
  acceptedConsents: Array<{ slug: string; version: string }>;
}

export interface RegisterResponse {
  success: boolean;
  trigger2FACode: {
    code: string;
    expiresAt: Date;
  } | null;
  userData: {
    userId: string;
    email: string;
  };
}

export type RegisterReq = OptionalAuthRequest<
  {},
  RegisterResponse,
  RegisterBody,
  Query
> &
  DeviceInfoRequest;

// ========== LOGIN ==========
export interface LoginBody {
  email: string;
  password: string;
  role?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    status?: string;
  };
  userId: string;
}

export type LoginReq = OptionalAuthRequest<
  {},
  LoginResponse,
  LoginBody,
  Query
> &
  DeviceInfoRequest;

// ========== LOGOUT ==========
export interface LogoutBody {
  refreshToken?: string;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
  cookieCleared: boolean;
}

export type LogoutReq = AuthRequest<{}, LogoutResponse, LogoutBody, Query> &
  DeviceInfoRequest;

// ========== REFRESH ==========
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    name: string;
  };
}

export type RefreshReq = OptionalAuthRequest<{}, RefreshResponse, {}, Query> &
  DeviceInfoRequest;

// ========== UPDATE USER ==========
export interface UpdateUserBody {
  name?: string;
  [key: string]: unknown;
}

export interface UpdateUserResponse {
  success: boolean;
  user: UserDocument;
}

export type UpdateUserReq = AuthRequest<
  {},
  UpdateUserResponse,
  UpdateUserBody,
  Query
> &
  DeviceInfoRequest & {
    uploadedFiles?: Record<string, any>;
  };

// ========== VERIFY 2FA ==========
export interface Verify2FABody {
  userId: string;
  code: string;
  deviceId: string;
  device?: {
    deviceModel?: string;
    os?: string;
    osVersion?: string;
  };
}

export interface Verify2FAResponse {
  success: boolean;
  userData: {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
    refreshToken: string;
    accessToken: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export type Verify2FAReq = OptionalAuthRequest<
  {},
  Verify2FAResponse,
  Verify2FABody,
  Query
> &
  DeviceInfoRequest;

// ========== RESEND 2FA ==========
export interface ResendFABody {
  userId: string;
}

export interface ResendFAResponse {
  code: string;
  expiresAt: Date;
  email: string;
}

export type ResendFAReq = OptionalAuthRequest<
  {},
  ResendFAResponse,
  ResendFABody,
  Query
> &
  DeviceInfoRequest;

// ========== GET SESSIONS ==========
export interface GetSessionsResponse {
  sessions: UserSessionDocument[];
  activeSessions: number;
}

export type GetSessionsReq = AuthRequest<{}, GetSessionsResponse, {}, Query> &
  DeviceInfoRequest;

// ========== REVOKE SESSION ==========
export interface RevokeSessionBody {
  sessionId: string;
}

export interface RevokeSessionResponse {
  success: boolean;
}

export type RevokeSessionReq = AuthRequest<
  {},
  RevokeSessionResponse,
  RevokeSessionBody,
  Query
> &
  DeviceInfoRequest;

// ========== CHANGE PASSWORD ==========
export interface ChangePasswordBody {
  oldPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

export type ChangePasswordReq = AuthRequest<
  {},
  ChangePasswordResponse,
  ChangePasswordBody,
  Query
> &
  DeviceInfoRequest;

// ========== CHECK TOKEN ==========
export interface CheckResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    name: string;
    status?: string;
  };
}

export type CheckReq = OptionalAuthRequest<{}, CheckResponse, {}, Query> &
  DeviceInfoRequest;

// ========== INITIATE PASSWORD RESET ==========
export interface InitiatePasswordResetBody {
  email: string;
}

export interface InitiatePasswordResetResponse {
  ok: boolean;
}

export type InitiatePasswordResetReq = OptionalAuthRequest<
  {},
  InitiatePasswordResetResponse,
  InitiatePasswordResetBody,
  Query
> &
  DeviceInfoRequest;

// ========== COMPLETE PASSWORD RESET ==========
export interface CompletePasswordResetBody {
  resetToken: string;
  newPassword: string;
  email: string;
}

export interface CompletePasswordResetResponse {
  success: boolean;
  userId: string;
  message?: string;
}

export type CompletePasswordResetReq = OptionalAuthRequest<
  {},
  CompletePasswordResetResponse,
  CompletePasswordResetBody,
  Query
> &
  DeviceInfoRequest;

// ========== VERIFY PASSWORD RESET CODE ==========
export interface VerifyPasswordResetCodeBody {
  email: string;
  code: string;
}

export interface VerifyPasswordResetCodeResponse {
  resetToken: string;
  userId: string;
}

export type VerifyPasswordResetCodeReq = OptionalAuthRequest<
  {},
  VerifyPasswordResetCodeResponse,
  VerifyPasswordResetCodeBody,
  Query
> &
  DeviceInfoRequest;

// ========== RESEND RESET CODE ==========
export interface ResendResetCodeBody {
  email: string;
}

export interface ResendResetCodeResponse {
  success: boolean;
  message?: string;
}

export type ResendResetCodeReq = OptionalAuthRequest<
  {},
  ResendResetCodeResponse,
  ResendResetCodeBody,
  Query
> &
  DeviceInfoRequest;

// ========== UPDATE ONLINE STATUS ==========
export interface UpdateOnlineStatusBody {
  status: string;
}

export interface UpdateOnlineStatusResponse {
  success: boolean;
}

export type UpdateOnlineStatusReq = AuthRequest<
  {},
  UpdateOnlineStatusResponse,
  UpdateOnlineStatusBody,
  Query
> &
  DeviceInfoRequest;
