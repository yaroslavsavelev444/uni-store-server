//@ts-nocheck
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import auditLogger from "../logger/auditLogger.js";
import logger from "../logger/logger.js";
import { create2FACodeAndNotify } from "../services/2faService.js";
import authService, { getUserProfile } from "../services/authService.js";
import consentService from "../services/consentService.js";
import type {
  ChangePasswordReq,
  CheckReq,
  CompletePasswordResetReq,
  GetSessionsReq,
  InitiatePasswordResetReq,
  LoginReq,
  LogoutReq,
  RefreshReq,
  RegisterReq,
  ResendFAReq,
  ResendResetCodeReq,
  RevokeSessionReq,
  UpdateOnlineStatusReq,
  UpdateUserReq,
  Verify2FAReq,
  VerifyPasswordResetCodeReq,
} from "../types/controllers/auth-controller.js";
import getIp from "../utils/getIp.js";
import { normalizeEmail } from "../utils/normalizers.js";
import { validatePassword } from "../validators/passwordValidator.js";

class AuthController {
  register = async (
    req: RegisterReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userData = req.body;
      const ip = getIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      if (!userData) {
        throw ApiError.BadRequest("Пользователь не передан");
      }

      const { email, password, name, acceptedConsents } = userData;

      if (!email || !password || !name || !acceptedConsents) {
        throw ApiError.BadRequest("Переданы не все данные");
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        throw ApiError.BadRequest(passwordError);
      }

      if (!Array.isArray(acceptedConsents) || acceptedConsents.length === 0) {
        throw ApiError.BadRequest("Согласия не переданы");
      }

      logger.info(`Registering user with email: ${acceptedConsents}`);

      const acceptedSlugs = acceptedConsents.map((c) => {
        if (!c.slug || !c.version) {
          throw ApiError.BadRequest("Некорректный формат согласий");
        }
        return c.slug;
      });

      const validConsents =
        await consentService.checkAllAcceptedConsents(acceptedSlugs);

      const { user } = await authService.register(userData);

      let faResult = null;

      if (user.userId) {
        faResult = await create2FACodeAndNotify(user.userId);
        await auditLogger.logUserEvent(
          user.userId,
          email,
          "USER_REGISTRATION",
          "CREATE_ACCOUNT_2FA",
          {
            ip,
            userAgent,
            name,
            acceptedConsents: validConsents,
            verificationMethod: "email_2fa",
            passwordStrength: "strong",
          },
        );
      }

      res.status(200).json({
        success: true,
        trigger2FACode: faResult,
        userData: { userId: user.userId, email: user.email },
      });
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        "unknown",
        req.body?.email || "unknown@email",
        "USER_REGISTRATION",
        "CREATE_ACCOUNT_FAILED",
        {
          ip,
          error: (error as Error).message,
          failedField: (error as Error).message.includes("Пароль")
            ? "password"
            : "other",
        },
      );
      logger.error(`[REGISTER] ${(error as Error).message}`);
      next(error);
    }
  };

  login = async (
    req: LoginReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userData = req.body;
      const ip = getIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      console.log(`[LOGIN] userData`, userData);
      if (!userData.email || !userData.password) {
        throw ApiError.BadRequest("Email и пароль обязательны");
      }

      const result = await authService.login(userData);

      if (result.userData.userId) {
        await auditLogger.logUserEvent(
          result.userData.userId,
          userData.email,
          "USER_AUTHENTICATION",
          "LOGIN_SUCCESS",
          {
            ip,
            userAgent,
            role: userData.role || "user",
            method: "email_password",
            deviceType: req.deviceType || "unknown",
          },
        );
      }

      res.status(200).json(result);
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        "unknown",
        req.body?.email || "unknown@email",
        "USER_AUTHENTICATION",
        "LOGIN_FAILED",
        {
          ip,
          userAgent: req.headers["user-agent"] || "unknown",
          error: (error as Error).message,
          reason:
            error instanceof ApiError ? error.message : "Invalid credentials",
        },
      );
      logger.error(`[LOGIN] ${(error as Error).message}`);
      next(error);
    }
  };

  logout = async (
    req: LogoutReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const refreshToken =
        req.cookies?.refreshToken ||
        req.headers["refresh-token"] ||
        req.body?.refreshToken;
      const userData = req.user;
      const ip = getIp(req);

      if (!refreshToken) {
        console.warn("[LOGOUT] No refresh token provided");
      }

      let result = { logout: false };
      if (refreshToken && userData) {
        result = await authService.logout(refreshToken, userData);
      }

      res.clearCookie("refreshToken", {
        path: "/",
        domain:
          process.env.NODE_ENV === "production" ? ".npo-polet.ru" : undefined,
      });

      if (userData?.id) {
        await auditLogger.logUserEvent(
          userData.id,
          userData.email,
          "USER_AUTHENTICATION",
          "LOGOUT",
          {
            ip,
            sessionEnded: true,
            logoutType: "manual",
            tokenCleared: true,
          },
        );
      }

      res.status(200).json({
        ...result,
        message: "Сессия завершена",
        cookieCleared: true,
      });
    } catch (error) {
      res.clearCookie("refreshToken", {
        path: "/",
        domain:
          process.env.NODE_ENV === "production" ? ".npo-polet.ru" : undefined,
      });
      logger.error(`[LOGOUT] ${(error as Error).message}`);
      next(error);
    }
  };

  refresh = async (
    req: RefreshReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const refreshToken =
        req.cookies?.refreshToken || req.headers["refresh-token"];
      if (!refreshToken) {
        throw ApiError.BadRequest("refreshToken не передан");
      }

      const ip = getIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      const userData = await authService.refreshService(
        refreshToken as string,
        req.deviceType,
        ip,
      );

      if (userData?.user.id) {
        await auditLogger.logUserEvent(
          userData.user.id.toString(),
          userData.user.email || "unknown@email",
          "USER_AUTHENTICATION",
          "TOKEN_REFRESH",
          {
            ip,
            userAgent,
            deviceType: req.deviceType || "unknown",
            tokenRefreshed: true,
            source: req.cookies?.refreshToken ? "cookie" : "header",
          },
        );
      }

      const isProd = process.env.NODE_ENV === "production";
      const isHTTPS =
        req.protocol === "https" ||
        req.headers["x-forwarded-proto"] === "https";

      res.cookie("refreshToken", userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProd || isHTTPS,
        sameSite: isProd ? "strict" : "lax",
        domain: isProd ? ".npo-polet.ru" : undefined,
        path: "/",
      });

      res.json(userData);
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        "unknown",
        "unknown@email",
        "USER_AUTHENTICATION",
        "TOKEN_REFRESH_FAILED",
        {
          ip,
          error: (error as Error).message,
          reason: "Invalid or expired refresh token",
        },
      );
      next(error);
    }
  };

  updateUser = async (
    req: UpdateUserReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userData = req.body;
      const files = req.uploadedFiles;
      const userId = req.user.id;
      const ip = getIp(req);

      console.log("[UPDATE_USER] req.body", req.body);

      const oldData = await getUserProfile(userId);
      const result = await authService.updateUser(userId, userData, files);

      const changes = [];
      if (oldData && oldData.name !== userData.name) {
        changes.push({
          field: "name",
          old: oldData.name,
          new: userData.name,
        });
      }

      await auditLogger.logUserEvent(
        userId,
        req.user.email,
        "USER_PROFILE",
        "UPDATE_PROFILE",
        {
          ip,
          changes:
            changes.length > 0
              ? changes
              : [{ field: "updated", old: null, new: "profile_data" }],
          filesCount: files ? Object.keys(files).length : 0,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        req.user?.id || "unknown",
        req.user?.email || "unknown@email",
        "USER_PROFILE",
        "UPDATE_PROFILE_FAILED",
        {
          ip,
          error: (error as Error).message,
          fieldsUpdated: Object.keys(req.body || {}).join(", "),
        },
      );
      next(error);
    }
  };

  verify2faCode = async (
    req: Verify2FAReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { userId, code, deviceId } = req.body;
      const ip = getIp(req);
      const deviceType = req.deviceType;

      if (!userId || !code || !deviceId) {
        throw ApiError.BadRequest("Отсутствует userId или код");
      }

      const device = {
        deviceId: deviceId,
        os: req.body.device?.os || req.useragent?.os,
        osVersion: req.body.device?.osVersion || req.useragent?.version,
      };

      const userData = await authService.verify2FAAndNotify(
        userId,
        code,
        deviceType,
        ip,
        device,
      );

      await auditLogger.logUserEvent(
        userId,
        userData.email || "unknown@email",
        "USER_VERIFICATION",
        "2FA_VERIFIED",
        {
          ip,
          deviceType,
          deviceId,
          verificationMethod: "email_code",
          newSession: true,
        },
      );

      const isProd = process.env.NODE_ENV === "production";
      const isHTTPS =
        req.protocol === "https" ||
        req.headers["x-forwarded-proto"] === "https";

      res.cookie("refreshToken", userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProd || isHTTPS,
        sameSite: isProd ? "strict" : "lax",
        domain: isProd ? ".npo-polet.ru" : undefined,
        path: "/",
      });

      res.status(200).json({
        success: true,
        userData,
        user: userData.user,
      });
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        req.body?.userId || "unknown",
        "unknown@email",
        "USER_VERIFICATION",
        "2FA_VERIFY_FAILED",
        {
          ip,
          deviceId: req.body?.deviceId || "unknown",
          error: (error as Error).message,
          codeAttempt: req.body?.code ? "yes" : "no",
        },
      );
      next(error);
    }
  };

  resendFaCode = async (
    req: ResendFAReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { userId } = req.body;
      const ip = getIp(req);

      if (!userId) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const result = await create2FACodeAndNotify(userId);

      await auditLogger.logUserEvent(
        userId,
        result.email || "unknown@email",
        "USER_VERIFICATION",
        "RESEND_2FA_CODE",
        {
          ip,
          resendCount: 1,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      logger.error(`[RESEND_FA_CODE] ${(error as Error).message}`);
      next(error);
    }
  };

  getSessions = async (
    req: GetSessionsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userData = req.user;
      const ip = getIp(req);

      if (!userData) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const result = await authService.getSessions(userData.id);
      await auditLogger.logUserEvent(
        userData.id,
        userData.email,
        "USER_SESSIONS",
        "VIEW_SESSIONS",
        {
          ip,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      logger.error(`[GET_SESSIONS] ${(error as Error).message}`);
      next(error);
    }
  };

  revokeSession = async (
    req: RevokeSessionReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userData = req.user;
      const { sessionId } = req.body;
      const ip = getIp(req);

      console.log("req.body", req.body);

      if (!sessionId) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const result = await authService.revokeSession(userData.id, sessionId);

      await auditLogger.logUserEvent(
        userData.id,
        userData.email,
        "USER_SESSIONS",
        "REVOKE_SESSION",
        {
          ip,
          sessionId,
          revokedBy: "user",
        },
      );

      res.status(201).json(result);
    } catch (error) {
      logger.error(`[REVOKE_SESSION] ${(error as Error).message}`);
      next(error);
    }
  };

  changePassword = async (
    req: ChangePasswordReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userData = req.user;
      const { oldPassword, newPassword } = req.body;
      const ip = getIp(req);

      if (!oldPassword || !newPassword) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const result = await authService.changePassword(
        userData.id,
        oldPassword,
        newPassword,
      );

      await auditLogger.logUserEvent(
        userData.id,
        userData.email,
        "USER_SECURITY",
        "CHANGE_PASSWORD",
        {
          ip,
          passwordChanged: true,
          changedBy: "user",
          requiresReauth: true,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        req.user?.id || "unknown",
        req.user?.email || "unknown@email",
        "USER_SECURITY",
        "CHANGE_PASSWORD_FAILED",
        {
          ip,
          error: (error as Error).message,
          reason: "Invalid old password or weak new password",
        },
      );
      logger.error(`[CHANGE_PASSWORD] ${(error as Error).message}`);
      next(error);
    }
  };

  check = async (
    req: CheckReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const accessToken = req.headers.authorization?.split(" ")[1];
      const refreshToken =
        req.cookies.refreshToken || req.headers["refresh-token"];

      if (!accessToken || !refreshToken) {
        console.log("[CHECK] Tokens missing:", {
          accessToken: !!accessToken,
          refreshToken: !!refreshToken,
          cookies: !!req.cookies?.refreshToken,
          headers: !!req.headers["refresh-token"],
        });
        throw ApiError.BadRequest("Токены не переданы");
      }

      const ip = getIp(req);
      const userData = await authService.checkService(
        accessToken,
        refreshToken as string,
        req.deviceType,
        ip,
      );

      if (userData?.user.id) {
        await auditLogger.logUserEvent(
          userData.user.id.toString(),
          userData.user.email || "unknown@email",
          "USER_AUTHENTICATION",
          "TOKEN_CHECK",
          {
            ip,
            tokenValid: true,
            deviceType: req.deviceType || "unknown",
            tokenSource: req.cookies?.refreshToken ? "cookie" : "header",
          },
        );
      }

      const isProd = process.env.NODE_ENV === "production";
      const isHTTPS =
        req.protocol === "https" ||
        req.headers["x-forwarded-proto"] === "https";

      if (userData.refreshToken !== refreshToken) {
        res.cookie("refreshToken", userData.refreshToken, {
          maxAge: 30 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          secure: isProd || isHTTPS,
          sameSite: isProd ? "strict" : "lax",
          domain: isProd ? ".npo-polet.ru" : undefined,
          path: "/",
        });
      }

      res.json(userData);
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        "unknown",
        "unknown@email",
        "USER_AUTHENTICATION",
        "TOKEN_CHECK_FAILED",
        {
          ip,
          error: (error as Error).message,
          reason: "Invalid or expired tokens",
        },
      );
      next(error);
    }
  };

  initiatePasswordReset = async (
    req: InitiatePasswordResetReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ip = getIp(req);
      const email = req.body.email.toLowerCase();
      if (!email) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      await authService.initiatePasswordReset(email);

      await auditLogger.logUserEvent(
        "unknown",
        email,
        "USER_SECURITY",
        "PASSWORD_RESET_INITIATED",
        {
          ip,
          resetMethod: "email",
          emailSent: true,
        },
      );

      res.status(200).json({ ok: true });
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        "unknown",
        req.body?.email || "unknown@email",
        "USER_SECURITY",
        "PASSWORD_RESET_INITIATE_FAILED",
        {
          ip,
          error: (error as Error).message,
          emailExists: (error as Error).message.includes("not found")
            ? "no"
            : "unknown",
        },
      );
      next(error);
    }
  };

  completePasswordReset = async (
    req: CompletePasswordResetReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { resetToken, newPassword } = req.body;
      const ip = getIp(req);

      if (!resetToken || !newPassword) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        throw ApiError.BadRequest(passwordError);
      }

      const email = normalizeEmail(req.body.email);
      const result = await authService.completePasswordReset(
        email,
        resetToken,
        newPassword,
      );

      await auditLogger.logUserEvent(
        result.userId || "unknown",
        email,
        "USER_SECURITY",
        "PASSWORD_RESET_COMPLETED",
        {
          ip,
          resetMethod: "email_token",
          passwordChanged: true,
          requiresReauth: true,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        "unknown",
        req.body?.email || "unknown@email",
        "USER_SECURITY",
        "PASSWORD_RESET_FAILED",
        {
          ip,
          error: (error as Error).message,
          reason: "Invalid token or weak password",
        },
      );
      next(error);
    }
  };

  verifyPasswordResetCode = async (
    req: VerifyPasswordResetCodeReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, code } = req.body;
      const ip = getIp(req);

      if (!email || !code) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const normalizedEmail = normalizeEmail(email);
      const result = await authService.verifyPasswordResetCode(
        normalizedEmail,
        code,
      );

      await auditLogger.logUserEvent(
        result.user.id.toString() || "unknown",
        email,
        "USER_SECURITY",
        "PASSWORD_RESET_CODE_VERIFIED",
        {
          ip,
          codeValid: true,
          resetTokenIssued: !!result.resetToken,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      const ip = getIp(req);
      await auditLogger.logUserEvent(
        "unknown",
        req.body?.email || "unknown@email",
        "USER_SECURITY",
        "PASSWORD_RESET_CODE_INVALID",
        {
          ip,
          error: (error as Error).message,
          codeAttempt: req.body?.code ? "yes" : "no",
        },
      );
      next(error);
    }
  };

  resendResetCode = async (
    req: ResendResetCodeReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ip = getIp(req);
      const email = normalizeEmail(req.body.email);

      if (!email) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const result = await authService.resendResetCode(email);

      await auditLogger.logUserEvent(
        "unknown",
        email,
        "USER_SECURITY",
        "PASSWORD_RESET_CODE_RESENT",
        {
          ip,
          resendCount: 1,
          emailResent: true,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateOnlineStatus = async (
    req: UpdateOnlineStatusReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { status } = req.body;
      const userId = req.user.id;
      const ip = getIp(req);

      const result = await authService.updateOnlineStatusService(
        userId,
        status,
      );

      await auditLogger.logUserEvent(
        userId,
        req.user.email,
        "USER_STATUS",
        "UPDATE_ONLINE_STATUS",
        {
          ip,
          newStatus: status,
        },
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default new AuthController();
