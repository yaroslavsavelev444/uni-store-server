import { Types } from "mongoose";
import { UserDTO } from "../dtos/user.dto.js";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import {
  UserModel,
  UserSecurityModel,
  UserSessionModel,
} from "../models/index.models.js";
import { sendEmailNotification } from "../queues/taskQueues.js";
import redisClient from "../redis/redis.client.js";
import type { UserDocument } from "../types/user.types.js";
import type { UserSessionDocument } from "../types/userSession.types.js";
import { generate2FACode, hashCode, isCodeMatch } from "../utils/generators.js";
import tokenService from "./tokenService.js";

// Вспомогательный тип для параметров сессии
interface SessionPayload {
  userId: Types.ObjectId;
  refreshToken: string;
  deviceId?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  os?: string | null;
  osVersion?: string | null;
  ip?: string | null;
}

// Тип для результата создания 2FA кода
interface TwoFAResult {
  code: string;
  expiresInMinutes: number;
  email: string;
}

// Тип для девайса (приходит с фронта)
// Тип для информации об устройстве (взят из контекста)
interface DeviceInfo {
  deviceId?: string;
  model?: string;
  os?: string;
  osVersion?: string;
}

// Тип для результата createSessionAfter2FA
interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
  sendNotification: boolean;
  email: string;
}

/**
 * Создаёт 2FA код, сохраняет в БД и отправляет на email
 */
const create2FACodeAndNotify = async (
  userId: string | Types.ObjectId,
  expiresInMinutes: number = 5,
): Promise<{ email: string }> => {
  try {
    const result = await create2FACodeTransaction(userId, expiresInMinutes);

    await sendEmailNotification(result.email, "twofaCode", {
      code: result.code,
      expiresInMinutes: result.expiresInMinutes,
    });

    // Исправлено: подстановка переменной в шаблонную строку
    await redisClient.del(`verify:fa:resend:email:${result.email}`);

    return { email: result.email };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.InternalServerError("Не удалось создать 2FA-код");
  }
};

/**
 * Транзакционная часть: создаёт код, хэширует, сохраняет в UserSecurity
 */
const create2FACodeTransaction = async (
  userId: string | Types.ObjectId,
  expiresInMinutes: number = 5,
): Promise<TwoFAResult> => {
  if (!Types.ObjectId.isValid(userId.toString())) {
    throw ApiError.BadRequest("Некорректный ID пользователя");
  }

  try {
    const userData = await UserModel.findById(userId);
    const _userSecurity = await UserSecurityModel.findOne({ userId });

    if (!userData) {
      throw ApiError.BadRequest("Пользователь не найден");
    }

    const code = generate2FACode();
    // Исправлен console.log
    console.log(`2FA code for ${userData.email}: ${code}`);

    const hashedCode = hashCode(code);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const updateResult = await UserSecurityModel.updateOne(
      { userId },
      {
        $set: {
          twoFACodeHash: hashedCode,
          twoFACodeExpiresAt: expiresAt,
          twoFAAttempts: 0,
        },
      },
    );

    if (updateResult.matchedCount === 0) {
      throw ApiError.InternalServerError("Ошибка при сохранении 2FA-кода");
    }

    return {
      code,
      expiresInMinutes,
      email: userData.email,
    };
  } catch (error) {
    logger.error("Ошибка в create2FACodeTransaction:", error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.InternalServerError("Не удалось создать 2FA-код");
  }
};

/**
 * Только верификация кода (без создания сессии)
 * Возвращает DTO пользователя и сырой документ
 */
const verify2FACodeOnly = async (
  userId: string | Types.ObjectId,
  inputCode: string,
): Promise<{ user: UserDTO; freshUser: UserDocument }> => {
  try {
    const [user, userSecurity] = await Promise.all([
      UserModel.findById(userId),
      UserSecurityModel.findOne({ userId }),
    ]);

    if (!user || !userSecurity) {
      logger.warn({
        userId,
        user,
        userSecurity,
      });
      throw ApiError.NotFoundError("Пользователь не найден");
    }

    if (!userSecurity.twoFACodeHash || !userSecurity.twoFACodeExpiresAt) {
      logger.warn({
        userId,
        twoFACodeHash: userSecurity.twoFACodeHash,
        twoFACodeExpiresAt: userSecurity.twoFACodeExpiresAt,
      });
      throw ApiError.BadRequest("Код не был запрошен");
    }

    if (userSecurity.twoFAAttempts >= 10) {
      logger.warn({
        userId,
        attempts: userSecurity.twoFAAttempts,
      });
      throw ApiError.TooManyRequestsError(
        "Превышено количество попыток ввода кода",
      );
    }

    if (userSecurity.twoFACodeExpiresAt < new Date()) {
      logger.warn({
        userId,
        twoFACodeExpiresAt: userSecurity.twoFACodeExpiresAt,
      });
      await UserSecurityModel.updateOne(
        { userId },
        { $unset: { twoFACodeHash: "", twoFACodeExpiresAt: "" } },
      );
      throw ApiError.BadRequest("Код истёк. Запросите новый.");
    }

    const isValid = isCodeMatch(inputCode, userSecurity.twoFACodeHash);

    if (!isValid) {
      logger.warn({
        userId,
        inputCode,
        twoFACodeHash: userSecurity.twoFACodeHash,
      });
      await UserSecurityModel.updateOne(
        { userId },
        { $inc: { twoFAAttempts: 1 } },
      );
      throw ApiError.BadRequest("Неверный код");
    }

    await UserSecurityModel.updateOne(
      { userId },
      {
        $unset: {
          twoFACodeHash: "",
          twoFACodeExpiresAt: "",
        },
        $set: {
          twoFAAttempts: 0,
          twoFALastAttempt: null,
        },
      },
    );

    const freshUser = await UserModel.findById(userId);
    if (!freshUser) {
      throw ApiError.NotFoundError("Пользователь не найден после верификации");
    }

    const userDto = new UserDTO(freshUser);

    return { user: userDto, freshUser };
  } catch (error) {
    logger.error("⛔ Ошибка при проверке 2FA кода", {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack,
      status: (error as any).status,
      errors: (error as any).errors,
    });
    throw error;
  }
};

/**
 * Создаёт сессию после успешной 2FA
 */
const createSessionAfter2FA = async (
  userDto: UserDTO,
  freshUser: UserDocument,
  deviceType?: string,
  ip?: string,
  device?: DeviceInfo,
): Promise<SessionResult> => {
  try {
    // Приводим id к строке, так как TokenPayload ожидает id?: string
    const tokenPayload = {
      ...userDto,
      id: String(userDto.id),
    };
    const tokens = tokenService.generateToken(tokenPayload);

    // Гарантируем наличие refreshToken (по умолчанию generateToken возвращает refreshToken)
    if (!tokens.refreshToken) {
      throw new Error("Не удалось сгенерировать refresh token");
    }

    const sessionPayload = {
      userId: freshUser._id as Types.ObjectId,
      refreshToken: tokens.refreshToken,
      deviceId: device?.deviceId ?? null,
      deviceType: deviceType || null,
      deviceModel: device?.model || null,
      os: device?.os || null,
      osVersion: device?.osVersion || null,
      ip: ip || null,
    };

    await createOrUpdateSession(sessionPayload);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userDto,
      sendNotification: true,
      email: freshUser.email,
    };
  } catch (error) {
    logger.error("⛔ Ошибка при создании сессии после 2FA", {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
};

const MAX_SESSIONS_PER_USER = parseInt(
  process.env.MAX_SESSIONS_PER_USER ?? "5",
  10,
);

/**
 * Создаёт или обновляет сессию (upsert)
 */
async function createOrUpdateSession({
  userId,
  refreshToken,
  deviceId = null,
  deviceType = null,
  deviceModel = null,
  os = null,
  osVersion = null,
  ip = null,
}: SessionPayload): Promise<UserSessionDocument> {
  // Формируем фильтр: при наличии deviceId — фильтруем по нему, иначе по комбинации полей
  const filter = deviceId
    ? { userId, deviceId }
    : { userId, deviceType, deviceModel, ip };

  const update = {
    $set: {
      refreshToken,
      deviceId,
      deviceType,
      deviceModel,
      os,
      osVersion,
      ip,
      lastUsedAt: new Date(),
      revoked: false,
    },
    $setOnInsert: {
      createdAt: new Date(),
    },
  };

  const options = { new: true, upsert: true };

  // атомарно обновляем или создаём
  const session = await UserSessionModel.findOneAndUpdate(
    filter,
    update,
    options,
  ).exec();

  if (!session) {
    throw new Error("Failed to create or update session");
  }

  // После успешного создания/обновления — принудительная очистка старых сессий
  await pruneSessions(userId, MAX_SESSIONS_PER_USER);

  return session;
}

/**
 * Удаляет старые сессии, оставляя только maxSessions самых новых
 */
async function pruneSessions(
  userId: Types.ObjectId,
  maxSessions: number,
): Promise<void> {
  const sessions = await UserSessionModel.find({ userId, revoked: false })
    .sort({ lastUsedAt: -1 }) // самые новые в начале
    .skip(maxSessions)
    .exec();

  if (sessions && sessions.length > 0) {
    const ids = sessions.map((s) => s._id);
    await UserSessionModel.updateMany(
      { _id: { $in: ids } },
      { $set: { revoked: true } },
    );
    logger.info({
      message: `Pruned ${sessions.length} sessions for user ${userId}`,
    });
  }
}

/**
 * Основная публичная функция: верифицирует код и создаёт сессию
 */
const verify2FACode = async (
  userId: string | Types.ObjectId,
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
    // Используем новую функцию для верификации
    const { user: userDto, freshUser } = await verify2FACodeOnly(
      userId,
      inputCode,
    );

    // Создаем сессию
    const result = await createSessionAfter2FA(
      userDto,
      freshUser,
      deviceType,
      ip,
      device,
    );

    return result;
  } catch (error) {
    logger.error("⛔ Ошибка в verify2FACode", {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
};

// Экспорты
export default {
  create2FACodeAndNotify,
  create2FACodeTransaction,
  createSessionAfter2FA,
  verify2FACode,
  verify2FACodeOnly,
};

export {
  create2FACodeAndNotify,
  create2FACodeTransaction,
  createSessionAfter2FA,
  verify2FACode,
  verify2FACodeOnly,
};
