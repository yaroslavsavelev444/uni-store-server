const authService = require("../services/authService");
const logger = require("../logger/logger");
const ApiError = require("../exceptions/api-error");
const getIp = require("../utils/getIp");
const { create2FACodeAndNotify } = require("../services/2faService");
const auditLogger = require("../logger/auditLogger");

const register = async (req, res, next) => {
  try {
    const userData = req.body;
    const ip = getIp(req);
    const userAgent = req.headers["user-agent"] || "unknown";

    if (!userData) {
      throw ApiError.BadRequest("Пользователь не передан");
    }

    if (
      !userData.email ||
      !userData.password ||
      !userData.name ||
      !userData.acceptedConsents
    ) {
      throw ApiError.BadRequest("Переданы не все данные");
    }

    const { user } = await authService.register(userData);

    let faResult = null;

    if (user.userId) {
      faResult = await create2FACodeAndNotify(user.userId);

      // Логирование успешной регистрации с 2FA
      await auditLogger.logUserEvent(
        user.userId,
        userData.email,
        "USER_REGISTRATION",
        "CREATE_ACCOUNT_2FA",
        {
          ip,
          userAgent,
          name: userData.name,
          acceptedConsents: userData.acceptedConsents,
          verificationMethod: "email_2fa",
        }
      );
    }

    return res.status(200).json({
      success: true,
      trigger2FACode: faResult,
      userData: { userId: user.userId, email: user.email },
    });
  } catch (error) {
    // Логирование ошибки регистрации
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      "unknown",
      req.body?.email || "unknown@email",
      "USER_REGISTRATION",
      "CREATE_ACCOUNT_FAILED",
      {
        ip,
        error: error.message,
        reason: error instanceof ApiError ? error.message : "System error",
      }
    );

    logger.error(`[REGISTER] ${error.message}`);
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const userData = req.body;
    const ip = getIp(req);
    const userAgent = req.headers["user-agent"] || "unknown";

    console.log(`[LOGIN] userData`, userData);
    if (!userData.email || !userData.password) {
      throw ApiError.BadRequest("Email и пароль обязательны");
    }

    const result = await authService.login(userData);

    // Логирование успешного входа
    if (result.userId) {
      await auditLogger.logUserEvent(
        result.userId,
        userData.email,
        "USER_AUTHENTICATION",
        "LOGIN_SUCCESS",
        {
          ip,
          userAgent,
          role: userData.role || "user",
          method: "email_password",
          deviceType: req.deviceType || "unknown",
        }
      );
    }

    return res.status(200).json(result);
  } catch (error) {
    // Логирование неудачной попытки входа
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      "unknown",
      req.body?.email || "unknown@email",
      "USER_AUTHENTICATION",
      "LOGIN_FAILED",
      {
        ip,
        userAgent: req.headers["user-agent"] || "unknown",
        error: error.message,
        reason:
          error instanceof ApiError ? error.message : "Invalid credentials",
      }
    );

    logger.error(`[LOGIN] ${error.message}`);
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || 
                        req.headers["refresh-token"] || 
                        req.body?.refreshToken;
    const userData = req.user;
    const ip = getIp(req);

    if (!refreshToken) {
      console.warn("[LOGOUT] No refresh token provided");
    }

    let result = { success: true };
    
    if (refreshToken && userData) {
      result = await authService.logout(refreshToken, userData);
    }

    // ВСЕГДА очищаем cookie и возвращаем подтверждение
    res.clearCookie("refreshToken", {
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".npo-polet.store" : undefined,
    });

    // Логирование выхода
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
        }
      );
    }

    return res.status(200).json({
      ...result,
      message: "Сессия завершена",
      cookieCleared: true,
    });

  } catch (error) {
    // Даже при ошибке очищаем cookie
    res.clearCookie("refreshToken", {
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".npo-polet.store" : undefined,
    });
    
    logger.error(`[LOGOUT] ${error.message}`);
    next(error);
  }
};
const refresh = async (req, res, next) => {
  try {
    // 1. Ищем refreshToken во ВСЕХ возможных местах
    let refreshToken = req.cookies?.refreshToken || 
                      req.headers["refresh-token"] || 
                      req.headers["x-refresh-token"] ||
                      req.body?.refreshToken;

    if (!refreshToken) {
      throw ApiError.BadRequest("refreshToken не передан");
    }

    const ip = getIp(req);
    const userAgent = req.headers["user-agent"] || "unknown";
    
    const userData = await authService.refreshService(
      refreshToken,
      req.deviceType,
      ip
    );

    // Логирование обновления токена
    if (userData?.user.id) {
      await auditLogger.logUserEvent(
        userData?.user.id,
        userData.user.email || "unknown@email",
        "USER_AUTHENTICATION",
        "TOKEN_REFRESH",
        {
          ip,
          userAgent,
          deviceType: req.deviceType || "unknown",
          tokenRefreshed: true,
          source: req.cookies?.refreshToken ? "cookie" : 
                 req.headers["refresh-token"] ? "header" : 
                 req.body?.refreshToken ? "body" : "unknown",
        }
      );
    }

    const isBrowser = req.useragent?.isDesktop || req.useragent?.browser !== "unknown" || 
                     (req.headers["user-agent"] && req.headers["user-agent"].includes("Mozilla"));

    // 2. ВСЕГДА устанавливаем cookie для браузеров
    if (isBrowser) {
      const isProd = process.env.NODE_ENV === "production";
      const isHTTPS = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
      
      res.cookie("refreshToken", userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
        httpOnly: true,
        secure: isProd || isHTTPS,
        sameSite: isProd ? "None" : "Lax", // "None" для кросс-домена
        path: "/",
        domain: isProd ? ".npo-polet.store" : undefined,
      });
    }

    // 3. ВСЕГДА возвращаем refreshToken в теле ответа
    return res.json({
      ...userData,
      refreshToken: userData.refreshToken, // ← ВСЕГДА дублируем в теле
      _meta: {
        cookieSet: isBrowser,
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        timestamp: new Date().toISOString(),
      }
    });

  } catch (e) {
    // Логирование ошибки обновления токена
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      "unknown",
      "unknown@email",
      "USER_AUTHENTICATION",
      "TOKEN_REFRESH_FAILED",
      {
        ip,
        error: e.message,
        reason: "Invalid or expired refresh token",
      }
    );

    next(e);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const userData = req.body;
    const files = req.uploadedFiles;
    const userId = req.user.id;
    const ip = getIp(req);

    console.log("[UPDATE_USER] req.body", req.body);

    // Получаем старые данные пользователя для сравнения
    const oldData = await authService.getUserProfile(userId);

    const result = await authService.updateUser(userId, userData, files);

    // Определяем изменения для логирования
    const changes = [];

    if (oldData) {
      // Сравниваем имя
      if (oldData.name !== userData.name) {
        changes.push({
          field: "name",
          old: oldData.name,
          new: userData.name,
        });
      }
    }

    // Логирование обновления профиля
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
      }
    );

    return res.status(200).json(result);
  } catch (e) {
    // Логирование ошибки обновления профиля
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      req.user?.id || "unknown",
      req.user?.email || "unknown@email",
      "USER_PROFILE",
      "UPDATE_PROFILE_FAILED",
      {
        ip,
        error: e.message,
        fieldsUpdated: Object.keys(req.body || {}).join(", "),
      }
    );

    next(e);
  }
};

const verify2faCode = async (req, res, next) => {
  try {
    const { userId, code, deviceId } = req.body;
    const ip = getIp(req);
    const deviceType = req.deviceType || req.useragent.platform || "Unknown";

    if (!userId || !code || !deviceId) {
      throw ApiError.BadRequest("Отсутствует userId или код");
    }

    const device = {
      deviceId: deviceId,
      deviceModel: req.body.device?.deviceModel || req.useragent.platform,
      os: req.body.device?.os || req.useragent.os,
      osVersion: req.body.device?.osVersion || req.useragent.version,
    };

    const userData = await authService.verify2FAAndNotify(
      userId,
      code,
      deviceType,
      ip,
      device
    );

    // Логирование успешной 2FA верификации
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
      }
    );

    const isBrowser = req.useragent.isDesktop || req.useragent.browser !== "unknown";

    // КРИТИЧЕСКИ ВАЖНО: ВСЕГДА устанавливаем cookie для браузеров
    if (isBrowser) {
      const isProd = process.env.NODE_ENV === "production";
      const isHTTPS = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
      
      // 1. ВСЕГДА УСТАНАВЛИВАЕМ HTTP-ONLY COOKIE
      res.cookie("refreshToken", userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
        httpOnly: true,
        secure: isProd || isHTTPS,
        sameSite: isProd ? "None" : "Lax", // "None" обязательно для кросс-домена
        path: "/",
        domain: isProd ? ".npo-polet.store" : undefined, // Доменное cookie для subdomain
      });
    }

    // 2. ВСЕГДА ВОЗВРАЩАЕМ refreshToken В ТЕЛЕ ОТВЕТА
    return res.status(200).json({
      success: true,
      userData,
      user: userData.user,
      refreshToken: userData.refreshToken, // ← ВСЕГДА возвращаем в теле
      _meta: {
        cookieSet: isBrowser,
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        timestamp: new Date().toISOString(),
      }
    });

  } catch (e) {
    // Логирование ошибки 2FA верификации
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      req.body?.userId || "unknown",
      "unknown@email",
      "USER_VERIFICATION",
      "2FA_VERIFY_FAILED",
      {
        ip,
        deviceId: req.body?.deviceId || "unknown",
        error: e.message,
        codeAttempt: req.body?.code ? "yes" : "no",
      }
    );

    next(e);
  }
};
const resendFaCode = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const ip = getIp(req);

    if (!userId) {
      throw ApiError.BadRequest("Недостаточно данных");
    }

    const result = await create2FACodeAndNotify(userId);

    // Логирование повторной отправки 2FA кода
    await auditLogger.logUserEvent(
      userId,
      result.email || "unknown@email",
      "USER_VERIFICATION",
      "RESEND_2FA_CODE",
      {
        ip,
        resendCount: 1,
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    logger.error(`[RESEND_FA_CODE] ${error.message}`);
    next(error);
  }
};

const getSessions = async (req, res, next) => {
  try {
    const userData = req.user;
    const ip = getIp(req);

    if (!userData) {
      throw ApiError.BadRequest("Недостаточно данных");
    }

    const result = await authService.getSessions(userData.id);

    // Логирование просмотра сессий
    await auditLogger.logUserEvent(
      userData.id,
      userData.email,
      "USER_SESSIONS",
      "VIEW_SESSIONS",
      {
        ip,
        sessionCount: result.sessions?.length || 0,
        activeSessions: result.activeSessions || 0,
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    logger.error(`[GET_SESSIONS] ${error.message}`);
    next(error);
  }
};

const revokeSession = async (req, res, next) => {
  try {
    const userData = req.user;
    const { sessionId } = req.body;

    console.log("req.body", req.body);

    const ip = getIp(req);

    if (!sessionId) {
      throw ApiError.BadRequest("Недостаточно данных");
    }

    const result = await authService.revokeSession(userData.id, sessionId);

    // Логирование отзыва сессии
    await auditLogger.logUserEvent(
      userData.id,
      userData.email,
      "USER_SESSIONS",
      "REVOKE_SESSION",
      {
        ip,
        sessionId,
        revokedBy: "user",
        remainingSessions: result.remainingSessions || 0,
      }
    );

    return res.status(201).json(result);
  } catch (error) {
    logger.error(`[REVOKE_SESSION] ${error.message}`);
    next(error);
  }
};

const changePassword = async (req, res, next) => {
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
      newPassword
    );

    // Логирование смены пароля
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
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    // Логирование ошибки смены пароля
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      req.user?.id || "unknown",
      req.user?.email || "unknown@email",
      "USER_SECURITY",
      "CHANGE_PASSWORD_FAILED",
      {
        ip,
        error: error.message,
        reason: "Invalid old password or weak new password",
      }
    );

    logger.error(`[CHANGE_PASSWORD] ${error.message}`);
    next(error);
  }
};
const check = async (req, res, next) => {
  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    
    // 1. Ищем refreshToken ВЕЗДЕ
    let refreshToken = req.cookies?.refreshToken || 
                      req.headers["refresh-token"] || 
                      req.headers["x-refresh-token"] ||
                      req.body?.refreshToken;

    if (!accessToken || !refreshToken) {
      console.log("[CHECK] Tokens missing:", {
        accessToken: !!accessToken,
        refreshToken: !!refreshToken,
        cookies: !!req.cookies?.refreshToken,
        headers: !!req.headers["refresh-token"],
        body: !!req.body?.refreshToken
      });
      throw ApiError.BadRequest("Токены не переданы");
    }

    const ip = getIp(req);
    const userData = await authService.checkService(
      accessToken,
      refreshToken,
      req.deviceType,
      ip
    );

    // Логирование проверки токена
    if (userData?.user.id) {
      await auditLogger.logUserEvent(
        userData?.user.id,
        userData.user.email || "unknown@email",
        "USER_AUTHENTICATION",
        "TOKEN_CHECK",
        {
          ip,
          tokenValid: true,
          deviceType: req.deviceType || "unknown",
          tokenSource: req.cookies?.refreshToken ? "cookie" : 
                     req.headers["refresh-token"] ? "header" : 
                     req.body?.refreshToken ? "body" : "unknown",
        }
      );
    }

    const isBrowser = req.useragent?.isDesktop || req.useragent?.browser !== "unknown" ||
                     (req.headers["user-agent"] && req.headers["user-agent"].includes("Mozilla"));

    // 2. ВСЕГДА обновляем cookie если это браузер
    if (isBrowser && userData.refreshToken !== refreshToken) {
      const isProd = process.env.NODE_ENV === "production";
      const isHTTPS = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";

      res.cookie("refreshToken", userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
        httpOnly: true,
        secure: isProd || isHTTPS,
        sameSite: isProd ? "None" : "Lax",
        path: "/",
        domain: isProd ? ".npo-polet.store" : undefined,
      });
    }

    // 3. ВСЕГДА возвращаем refreshToken в теле ответа
    return res.json({
      ...userData,
      refreshToken: userData.refreshToken, // ← ВСЕГДА дублируем
      _meta: {
        cookieRefreshed: isBrowser && userData.refreshToken !== refreshToken,
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        timestamp: new Date().toISOString(),
      }
    });

  } catch (e) {
    // Логирование ошибки проверки токена
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      "unknown",
      "unknown@email",
      "USER_AUTHENTICATION",
      "TOKEN_CHECK_FAILED",
      {
        ip,
        error: e.message,
        reason: "Invalid or expired tokens",
      }
    );

    next(e);
  }
};
const initiatePasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    const ip = getIp(req);

    if (!email) {
      throw ApiError.BadRequest("Недостаточно данных");
    }

    await authService.initiatePasswordReset(email);

    // Логирование инициации сброса пароля
    await auditLogger.logUserEvent(
      "unknown",
      email,
      "USER_SECURITY",
      "PASSWORD_RESET_INITIATED",
      {
        ip,
        resetMethod: "email",
        emailSent: true,
      }
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    // Логирование ошибки инициации сброса пароля
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      "unknown",
      req.body?.email || "unknown@email",
      "USER_SECURITY",
      "PASSWORD_RESET_INITIATE_FAILED",
      {
        ip,
        error: error.message,
        emailExists: error.message.includes("not found") ? "no" : "unknown",
      }
    );

    next(error);
  }
};

const completePasswordReset = async (req, res, next) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const ip = getIp(req);

    if (!email || !resetToken || !newPassword) {
      throw ApiError.BadRequest("Недостаточно данных");
    }

    const result = await authService.completePasswordReset(
      email,
      resetToken,
      newPassword
    );

    // Логирование успешного сброса пароля
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
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    // Логирование ошибки сброса пароля
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      "unknown",
      req.body?.email || "unknown@email",
      "USER_SECURITY",
      "PASSWORD_RESET_FAILED",
      {
        ip,
        error: error.message,
        reason: "Invalid token or weak password",
      }
    );

    next(error);
  }
};

const verifyPasswordResetCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const ip = getIp(req);

    if (!email || !code) {
      throw ApiError.BadRequest("Недостаточно данных");
    }

    const result = await authService.verifyPasswordResetCode(email, code);

    // Логирование успешной верификации кода сброса
    await auditLogger.logUserEvent(
      result.userId || "unknown",
      email,
      "USER_SECURITY",
      "PASSWORD_RESET_CODE_VERIFIED",
      {
        ip,
        codeValid: true,
        resetTokenIssued: !!result.resetToken,
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    // Логирование ошибки верификации кода сброса
    const ip = getIp(req);
    await auditLogger.logUserEvent(
      "unknown",
      req.body?.email || "unknown@email",
      "USER_SECURITY",
      "PASSWORD_RESET_CODE_INVALID",
      {
        ip,
        error: error.message,
        codeAttempt: req.body?.code ? "yes" : "no",
      }
    );

    next(error);
  }
};

const resendResetCode = async (req, res, next) => {
  try {
    const { email } = req.body;
    const ip = getIp(req);

    if (!email) {
      throw ApiError.BadRequest("Недостаточно данных");
    }

    const result = await authService.resendResetCode(email);

    // Логирование повторной отправки кода сброса
    await auditLogger.logUserEvent(
      "unknown",
      email,
      "USER_SECURITY",
      "PASSWORD_RESET_CODE_RESENT",
      {
        ip,
        resendCount: 1,
        emailResent: true,
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateOnlineStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const userId = req.user.id;
    const ip = getIp(req);

    const result = await authService.updateOnlineStatusService(userId, status);

    // Логирование изменения онлайн статуса
    await auditLogger.logUserEvent(
      userId,
      req.user.email,
      "USER_STATUS",
      "UPDATE_ONLINE_STATUS",
      {
        ip,
        newStatus: status,
      }
    );

    return res.json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  register,
  login,
  logout,
  verify2faCode,
  resendFaCode,
  refresh,
  getSessions,
  changePassword,
  updateUser,
  revokeSession,
  check,
  initiatePasswordReset,
  completePasswordReset,
  verifyPasswordResetCode,
  resendResetCode,
  updateOnlineStatus,
};
