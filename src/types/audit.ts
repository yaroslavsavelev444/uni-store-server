export interface AuditConfig {
  logRequestBody: boolean;
  maxBodySize: number;
  logSuccess: boolean;
  logClientErrors: boolean;
  logServerErrors: boolean;
  slowRequestThreshold: number;
  ignorePaths: string[];
  logMethods?: string[];
  includeUserAgent?: boolean;
  includeReferer?: boolean;
}

export type EnvironmentAuditConfig = {
  [key in "development" | "staging" | "production"]: AuditConfig;
};

export interface AuditMetadata {
  startTime: number;
  clientIp: string;
  requestId: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

export type UserType = "guest" | "user" | "moderator" | "admin";

export type RequestCategory = "CREATE" | "READ" | "UPDATE" | "DELETE" | "OTHER";

export interface AuditLogData {
  requestId: string;
  method: string;
  path: string;
  originalUrl: string;
  status: number;
  duration: string;
  ip: string;
  userId: string | "anonymous";
  userType: UserType;
  userAgent?: string;
  referer?: string;
  query?: any;
  params?: any;
  timestamp: string;
  response?: any;
  event?: string;
  threshold?: string;
}

export interface AuditErrorLogData {
  requestId: string;
  event: "REQUEST_ERROR";
  method: string;
  path: string;
  ip: string;
  userId?: string;
  error: string;
  stack?: string;
  duration: string;
  timestamp: string;
}

export interface SuspiciousActivityData {
  event: "SUSPICIOUS_ACTIVITY";
  type: "UNAUTHORIZED_ACCESS" | "FORBIDDEN_ACCESS";
  ip: string;
  path: string;
  method: string;
  userId: string | "anonymous";
  userAgent?: string;
  timestamp: string;
}

export interface AdminEventData {
  userId: string;
  userEmail: string;
  userRole: string;
  event: string;
  action: string;
  entityId?: string | null;
  changes?: any[];
  description: string;
}

// export interface UserEventData {
//   userId: string;
//   userEmail: string;
//   event: string;
//   action: string;
//   metadata: {
//     ip: string;
//     endpoint: string;
//     method: string;
//     statusCode: number;
//     duration: string;
//   };
// }
