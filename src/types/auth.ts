import type { Request } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";

export interface AuthMiddlewareOptions {
  allowedRoles?: string[];
  optional?: boolean;
  checkBlock?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  status?: string;
  blockedUntil?: Date | null;
  [key: string]: any;
}

/** Основной запрос с обязательным пользователем */
export interface AuthRequest<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = Query,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: AuthUser;
}

/** Запрос с опциональным пользователем */
export interface OptionalAuthRequest<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = Query,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: AuthUser | null;
}

export interface RequestWithCookies extends Request<
  ParamsDictionary,
  any,
  any,
  Query
> {
  cookies: {
    refreshToken?: string;
    [key: string]: any;
  };
}
