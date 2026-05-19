// types/user-controller.ts
import type { IUser, UserRole, UserStatus } from "../user.types.js";
import type { UserSanctionDocument } from "../user-sanction.types.js";

/* ===================== PARAMS ===================== */

export interface UserIdParams {
  userId: string;
}

/* ===================== QUERY ===================== */

export interface SearchUsersQuery {
  query?: string;
  status?: UserStatus;
  role?: UserRole;
  page?: string;
  limit?: string;
}

/* ===================== BODY ===================== */

export interface UpdateRoleBody {
  role: UserRole;
}

export interface BlockBody {
  duration?: number; // hours, 0 = permanent
  reason?: string;
  type?: "block" | "warning" | "restriction";
}

/* ===================== RESPONSES ===================== */

export interface GetAllUsersResponse {
  success: boolean;
  data: IUser[];
  count: number;
  message: string;
}

export interface UpdateRoleResponse {
  success: boolean;
  data: IUser;
  message: string;
}

export interface PromoteDemoteResponse {
  success: boolean;
  data: IUser;
  message: string;
}

export interface GetUserResponse {
  success: boolean;
  data: IUser;
  message: string;
}

export interface SearchUsersResponse {
  success: boolean;
  data: any[]; // actual type would be UserWithBlockInfo from user.service, but we can keep any or import
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  message: string;
}

export interface BlockUnblockResponse {
  success: boolean;
  data: UserSanctionDocument | IUser;
  message: string;
}

export interface GetSanctionsResponse {
  success: boolean;
  data: UserSanctionDocument[];
  count: number;
  message: string;
}

export interface GetBlockStatusResponse {
  success: boolean;
  data: any; // type from userSanctionService.checkUserBlockStatus
  message: string;
}

export interface GetUserDetailsResponse {
  success: boolean;
  data: IUser;
  message: string;
}
