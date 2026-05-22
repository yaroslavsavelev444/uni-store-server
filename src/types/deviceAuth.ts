// types/deviceAuth.ts (новый файл)
import type { Request } from "express";
import type { UserRole } from "./user.types.js";

export type DevicePlatform = "web" | "mobile" | "unknown";

export interface DeviceInfo {
  platform: DevicePlatform;
  deviceId?: string;
  appVersion?: string;
  userAgent?: string;
  timestamp?: string;
}

export interface AccessPolicy {
  allowedPlatforms: DevicePlatform[];
  message: string;
}

export interface AccessCheckResult {
  allowed: boolean;
  message: string;
  requiredPlatforms?: DevicePlatform[];
  currentPlatform?: DevicePlatform;
}

export interface DeviceAuthRequest extends Request {
  body: {
    email?: string;
    [key: string]: any;
  };
  device?: DeviceInfo;
  path: string;
}

export interface DeviceAuthErrorData {
  requiredPlatforms?: DevicePlatform[];
  currentPlatform?: DevicePlatform;
  userId?: string;
  userRole?: UserRole;
}

// Политики доступа для разных ролей
export const ROLE_ACCESS_POLICIES: Record<UserRole, AccessPolicy> = {
  admin: {
    allowedPlatforms: ["web", "mobile"],
    message: "Администраторам доступ разрешен только через веб-интерфейс",
  },
  user: {
    allowedPlatforms: ["web"],
    message: "Доступ разрешен",
  },
  superadmin: {
    allowedPlatforms: ["web", "mobile"],
    message: "Суперадминам доступ разрешен только через веб-интерфейс",
  },
} as const;
