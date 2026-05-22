// services/authService.ts
import { compare, hash } from "bcryptjs";
import { UserDTO } from "../dtos/user.dto.js";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import {
  UserAcceptedConsentModel,
  UserModel,
  UserSecurityModel,
  UserSessionModel,
} from "../models/index.models.js";
import taskQueues from "../queues/taskQueues.js";
import redisClient from "../redis/redis.client.js";
import type { IUser, UserDocument } from "../types/user.types.js";
import {
  type IUserSecurity,
  UserSecurityStatus,
} from "../types/userSecurity.types.js";
import type { IUserSession } from "../types/userSession.types.js";
import { registerSchema } from "../validators/user.validator.js";
import faService from "./2faService.js";
import SessionService from "./SessionService.js";
import tokenService, { type TokenPayload } from "./tokenService.js";
import userSanctionService from "./userSanctionService.js";

const { create2FACodeAndNotify, verify2FACode, verify2FACodeOnly } = faService;
const {
  validateRefreshToken,
  generateToken,
  validateAccessToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} = tokenService;
const { sendEmailNotification, sendPushNotification } = taskQueues;

// ========== Типы ==========
interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  acceptedConsents?: Array<{ slug: string; version: string }>;
}

interface MetaData {
  ip?: string;
  userAgent?: string;
}

interface DeviceInfo {
  deviceId?: string;
  deviceModel?: string;
  os?: string;
  osVersion?: string;
}

// ========== Сервис ==========
export const login = async (
  userData: LoginData,
): Promise<{
  twoFAInitiated: boolean;
  userData: { userId: string; email: string };
}> => {
  try {
    const { password } = userData;
    const email = userData.email.toLowerCase();

    const user = await UserModel.findOne({ email }).select("+password").exec();
    if (!user) {
      throw ApiError.BadRequest("Пользователь не найден");
    }

    const sanctionData = await userSanctionService.checkUserBlockStatus(
      user._id,
    );
    if (sanctionData.user.status === "blocked") {
      throw ApiError.ForbiddenError("Пользователь заблокирован");
    }

    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      throw ApiError.BadRequest("Неверный пароль");
    }

    await create2FACodeAndNotify(user._id);
    await redisClient.del(`login:email:${email}`);
    await redisClient.del(`login:email:${user._id}`);
    return {
      twoFAInitiated: true,
      userData: { userId: user._id.toString(), email: user.email },
    };
  } catch (error) {
    logger.error(`[LOGIN] ${(error as Error).message}`);
    if (error instanceof ApiError) throw error;
    throw ApiError.BadRequest((error as Error).message);
  }
};

export const logout = async (
  refreshToken: string,
  userData: TokenPayload,
): Promise<{ logout: boolean }> => {
  try {
    const user = await UserModel.findById(userData.id);
    if (!user) {
      throw ApiError.BadRequest("Пользователь не найден");
    }

    const session = await UserSessionModel.findOne({
      userId: user._id,
      refreshToken,
    });
    if (!session) {
      throw ApiError.BadRequest("Сессия пользователя не найдена");
    }

    session.revoked = true;
    await session.save();
    return { logout: true };
  } catch (error) {
    logger.error(`[LOGOUT] ${(error as Error).message}`);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError((error as Error).message);
  }
};

export const register = async (
  userData: unknown,
  meta: MetaData = {},
): Promise<{
  user: { userId: string; email: string; role: string };
}> => {
  try {
    const { error, value } = registerSchema.validate(userData, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join("; ");
      throw ApiError.BadRequest(`Ошибка валидации: ${details}`);
    }

    const { name, password, acceptedConsents } = value as RegisterData;
    const email = value.email.toLowerCase();

    const existingUser = await UserModel.findOne({ email }).exec();
    if (existingUser) {
      throw ApiError.BadRequest("Пользователь с таким email уже существует");
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS ?? "10", 10);
    const hashedPassword = await hash(password, saltRounds);

    const user = new UserModel({
      name,
      email,
      role: "user",
      password: hashedPassword,
    });

    const userSecurity = new UserSecurityModel({ userId: user._id });
    await Promise.all([user.save(), userSecurity.save()]);

    if (Array.isArray(acceptedConsents) && acceptedConsents.length > 0) {
      const consentDocs = acceptedConsents.map((consent) => ({
        userId: user._id,
        consentSlug: consent.slug,
        consentVersion: consent.version,
        ip: meta.ip ?? "unknown",
        userAgent: meta.userAgent ?? "unknown",
      }));
      await UserAcceptedConsentModel.insertMany(consentDocs, {
        ordered: false,
      });
    }

    return {
      user: {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    logger.error(`[REGISTER] ${(error as Error).message}`);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Произошла ошибка при регистрации");
  }
};

export const verify2FAAndNotify = async (
  userId: string,
  inputCode: string,
  deviceType?: string,
  ip?: string,
  device?: DeviceInfo,
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
  sendNotification: boolean;
  email: string;
}> => {
  try {
    const result = await verify2FACode(
      userId,
      inputCode,
      deviceType,
      ip,
      device,
    );
    if (result.sendNotification) {
      await redisClient.del(`verify:fa:email:${result.email}`);
      const loginDate = new Date();
      await sendEmailNotification(result.email, "newLogin", {
        ip: ip ?? "unknown",
        deviceType: deviceType ?? "unknown",
        deviceModel: device?.deviceModel ?? "unknown",
        os: device?.os ?? "unknown",
        osVersion: device?.osVersion ?? "unknown",
        date: loginDate,
      });
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error("Неизвестная ошибка в verify2FAAndNotify", {
      originalError: {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      },
    });
    throw ApiError.InternalServerError("Не удалось проверить код 2FA");
  }
};

export const refreshService = async (
  refreshToken: string,
  _deviceType?: string,
  ip?: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
}> => {
  if (!refreshToken) {
    throw ApiError.UnauthorizedError();
  }

  try {
    const isRevoked = await SessionService.isSessionRevoked(refreshToken);
    if (isRevoked) {
      logger.warn({
        msg: "Refresh attempt with revoked session",
        ip,
      });
      throw ApiError.UnauthorizedError();
    }

    const existingSession = await UserSessionModel.findOne({ refreshToken });
    if (!existingSession) {
      logger.warn({
        msg: "Refresh attempt with non-existent session",
        ip,
      });
      throw ApiError.UnauthorizedError();
    }

    if (existingSession.revoked) {
      logger.warn({
        msg: "Refresh attempt with revoked session",
        ip,
      });
      throw ApiError.UnauthorizedError();
    }

    const userData = validateRefreshToken(refreshToken);
    if (!userData || !userData.id) {
      logger.warn({
        msg: "Invalid refresh token",
        ip,
      });
      throw ApiError.UnauthorizedError();
    }

    const user = await UserModel.findById(userData.id);
    if (!user) {
      logger.warn({
        msg: "User not found",
        ip,
      });
      throw ApiError.UnauthorizedError();
    }

    const userDto = new UserDTO(user.toObject());
    //гарантируем id - string
    const readyUserDto = {
      ...userDto,
      id: String(userDto.id),
    };
    const tokens = generateToken({ ...readyUserDto });

    if (!tokens.refreshToken) {
      throw ApiError.InternalServerError(
        "Не удалось сгенерировать refresh token",
      );
    }

    const updatedSession = await UserSessionModel.findOneAndUpdate(
      {
        _id: existingSession._id,
        refreshToken,
      },
      {
        $set: {
          refreshToken: tokens.refreshToken,
          lastUsedAt: new Date(),
          ip: ip ?? existingSession.ip,
        },
      },
      { new: true, runValidators: true },
    );

    if (!updatedSession) {
      logger.error("Session update failed - possible race condition", {
        sessionId: existingSession._id,
        userId: user.id,
      });
      throw ApiError.InternalServerError("Ошибка обновления сессии");
    }

    await SessionService.addToTempBlacklist(refreshToken, 60);

    logger.info({
      msg: "Tokens refreshed",
      ip,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userDto,
    };
  } catch (error) {
    logger.error("Error in refreshService:", {
      error: (error as Error).message,
      stack: (error as Error).stack,
      ip,
    });
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Не удалось обновить токены");
  }
};

export const getSessions = async (userId: string): Promise<IUserSession[]> => {
  try {
    const sessions = await UserSessionModel.find({ userId, revoked: false });
    return sessions;
  } catch (error) {
    logger.error("Ошибка в getSessions:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Не удалось получить сессии");
  }
};

export const updateUser = async (
  userId: string,
  userData: unknown,
  _files?: unknown,
): Promise<UserDocument | null> => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.BadRequest("Пользователь не найден");

    const allowedFields = ["name", "avatarUrl"] as const;
    const updatePayload: Partial<Pick<IUser, "name">> = {};

    if (userData && typeof userData === "object") {
      for (const key of allowedFields) {
        if (Object.hasOwn(userData, key)) {
          (updatePayload as any)[key] = (userData as any)[key];
        }
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      throw ApiError.BadRequest("Нет допустимых данных для обновления");
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updatePayload },
      { new: true, runValidators: true },
    );
    return updatedUser;
  } catch (error) {
    logger.error("Ошибка в updateUser:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError(
      "Не удалось обновить данные пользователя",
    );
  }
};

export const changePassword = async (
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<UserDocument> => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.NotFoundError("Пользователь не найден");

    const isPasswordCorrect = await compare(oldPassword, user.password);
    if (!isPasswordCorrect) throw ApiError.BadRequest("Неправильный пароль");

    user.password = await hash(newPassword, 10);
    await user.save();

    // TODO: уведомление
    return user;
  } catch (error) {
    logger.error("Ошибка в changePassword:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Не удалось изменить пароль");
  }
};

export const revokeSession = async (
  userId: string,
  sessionId: string,
): Promise<IUserSession> => {
  try {
    const userData = await UserModel.findById(userId);
    if (!userData) throw ApiError.NotFoundError("Пользователь не найден");

    const session = await UserSessionModel.findById(sessionId);
    if (!session) throw ApiError.NotFoundError("Сессия не найдена");

    session.revoked = true;
    await session.save();
    return session;
  } catch (error) {
    logger.error("Ошибка в revokeSession:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Не удалось заблокировать сессию");
  }
};

export const checkService = async (
  accessToken: string,
  refreshToken: string,
  deviceType?: string,
  ip?: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
}> => {
  console.log(
    "checkService called",
    !!accessToken,
    !!refreshToken,
    deviceType,
    ip,
  );

  if (!accessToken || !refreshToken) {
    throw ApiError.BadRequest("Отсутствуют токены авторизации");
  }

  const refreshData = validateRefreshToken(refreshToken);
  if (!refreshData || !refreshData.id) {
    throw ApiError.UnauthorizedError();
  }

  const user = await UserModel.findById(refreshData.id);
  if (!user) throw ApiError.UnauthorizedError();

  const session = await UserSessionModel.findOne({
    userId: user._id,
    refreshToken,
  });
  if (!session || session.revoked) {
    throw ApiError.UnauthorizedError();
  }

  session.lastUsedAt = new Date();
  if (ip) session.ip = ip;
  if (deviceType) session.deviceType = deviceType;
  await session.save();

  const accessData = validateAccessToken(accessToken);
  if (accessData && String(accessData.id) === String(refreshData.id)) {
    return {
      accessToken,
      refreshToken,
      user: new UserDTO(user),
    };
  }

  const userDto = new UserDTO(user);
  const { accessToken: newAccess } = generateToken(
    { ...userDto, id: String(userDto.id) },
    { onlyAccess: true },
  );
  return {
    accessToken: newAccess,
    refreshToken,
    user: userDto,
  };
};

export const initiatePasswordReset = async (email: string): Promise<void> => {
  const user = await UserModel.findOne({ email });
  if (!user) throw ApiError.NotFoundError("Пользователь не найден");
  await create2FACodeAndNotify(user._id);
};

export const completePasswordReset = async (
  email: string,
  resetToken: string,
  newPassword: string,
): Promise<{ success: true; userId: string }> => {
  const { userId } = await verifyPasswordResetToken(resetToken);
  const userData = await UserModel.findOne({ _id: userId });
  if (!userData) throw ApiError.NotFoundError("Пользователь не найден");
  if (userData.email !== email) {
    throw ApiError.BadRequest("Email не соответствует токену сброса");
  }

  const saltRounds = parseInt(process.env.SALT_ROUNDS ?? "12", 10);
  const hashedPassword = await hash(newPassword, saltRounds);

  await Promise.all([
    UserModel.updateOne({ _id: userId, email }, { password: hashedPassword }),
    UserSecurityModel.updateOne(
      { userId },
      {
        $unset: { resetTokenHash: "", resetTokenExpiration: "" },
        $set: {
          resetTokenStatus: UserSecurityStatus.Verified,
          updatedAt: new Date(),
        },
      },
    ),
  ]);

  await sendPushNotification({
    userId: userData._id.toString(),
    title: "Ваш пароль успешно обновлен",
    body: "Если вы этого не совершали - срочно поменяйте пароль",
  });
  await sendEmailNotification(userData.email, "resetPasswordCompleted", {
    name: userData.name,
    email: userData.email,
  });
  await SessionService.invalidateAllSessionsExceptCurrent(userId);
  return { success: true, userId: userData._id.toString() };
};

export const verifyPasswordResetCode = async (
  email: string,
  code: string,
): Promise<{ resetToken: string; user: UserDTO }> => {
  const userData = await UserModel.findOne({ email });
  if (!userData) {
    throw ApiError.NotFoundError(
      "Пользователь не найден при подтверждении восстановления пароля",
    );
  }

  const { user } = await verify2FACodeOnly(userData._id.toString(), code);
  const signedToken = await generatePasswordResetToken(
    user.id.toString(),
    UserSecurityStatus.Pending,
  );
  await sendPushNotification({
    userId: user.id.toString(),
    title: "Зафиксирована попытка восстановления пароля",
    body: "Системой отправлен код для восстановления пароля, если вы не запрашивали его - проигнорируйте",
  });
  return { resetToken: signedToken, user };
};

export const resendResetCode = async (
  email: string,
): Promise<{ ok: true; message: string }> => {
  try {
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return { ok: true, message: "Код отправлен повторно" };
    }

    const userSecurity = await UserSecurityModel.findOne({ userId: user._id });
    if (userSecurity?.resetTokenExpiration) {
      const timeSinceLastRequest =
        Date.now() - userSecurity.resetTokenExpiration.getTime();
      if (timeSinceLastRequest < 60000) {
        throw ApiError.BadRequest(
          "Новый код можно запросить только через 1 минуту после предыдущего",
        );
      }
    }

    await initiatePasswordReset(email);
    return { ok: true, message: "Код отправлен повторно" };
  } catch (error) {
    logger.error("Error resending reset code", {
      email: `${email.substring(0, 3)}***`,
      error: (error as Error).message,
    });
    throw error;
  }
};

export const updateOnlineStatusService = async (
  userId: string,
  online: boolean,
): Promise<void> => {
  const userData = await UserModel.findById(userId);
  if (!userData) {
    throw ApiError.BadRequest("Пользователь не найден");
  }
  await UserModel.findByIdAndUpdate(userId, { online }, { new: true });
};

export const getUserProfile = async (userId: string): Promise<UserDocument> => {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw ApiError.NotFoundError("Пользователь не найден");
  }
  return user;
};

export default {
  login,
  logout,
  register,
  verify2FAAndNotify,
  refreshService,
  getSessions,
  updateUser,
  changePassword,
  revokeSession,
  checkService,
  initiatePasswordReset,
  completePasswordReset,
  verifyPasswordResetCode,
  resendResetCode,
  updateOnlineStatusService,
};
