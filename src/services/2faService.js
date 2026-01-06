const mongoose = require("mongoose");
const ApiError = require("../exceptions/api-error");
const {
  UserModel,
  UserSecurityModel,
  UserSessionModel,
} = require("../models/index.models");
const {
  generate2FACode,
  hashCode,
  isCodeMatch,
} = require("../utils/generators");
const { sendEmailNotification } = require("../queues/taskQueues");
const logger = require("../logger/logger");
const UserDTO = require("../dtos/user.dto");
const tokenService = require("./tokenService");
const redisClient = require("../redis/redis.client");
const create2FACodeAndNotify = async (userId, expiresInMinutes = 5) => {
  try {
    const result = await create2FACodeTransaction(userId, expiresInMinutes);

    await sendEmailNotification(result.email, "twofaCode", {
      code: result.code,
      expiresInMinutes: result.expiresInMinutes,
    });

     await redisClient.del(`verify:fa:resend:email:${result.email}`);

    return true;
  } catch (error) {
    logger.error(error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.InternalServerError("Не удалось создать 2FA-код");
  }
};


const create2FACodeTransaction = async (userId, expiresInMinutes = 5) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw ApiError.BadRequest("Некорректный ID пользователя");
  }

  try {
    const userData = await UserModel.findById(userId);
    const userSecurity = await UserSecurityModel.findOne({ userId });

    if (!userData || !userSecurity) {
      throw ApiError.BadRequest("Пользователь не найден");
    }

    const code = generate2FACode();
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
      }
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

// Функция только для верификации 2FA кода
const verify2FACodeOnly = async (userId, inputCode) => {

  try {
    const [user, userSecurity] = await Promise.all([
      UserModel.findById(userId),
      UserSecurityModel.findOne({ userId }),
    ]);

    if (!user || !userSecurity) {
      logger.warn("⛔ Пользователь или userSecurity не найдены", { userId });
      throw ApiError.NotFoundError("Пользователь не найден");
    }

    if (!userSecurity.twoFACodeHash || !userSecurity.twoFACodeExpiresAt) {
      logger.warn("⛔ Код 2FA не был запрошен", { userId });
      throw ApiError.BadRequest("Код не был запрошен");
    }

    if (userSecurity.twoFAAttempts >= 10) {
      logger.warn("⛔ Превышено количество попыток", { userId, attempts: userSecurity.twoFAAttempts });
      throw ApiError.TooManyRequests("Превышено количество попыток ввода кода");
    }

    if (userSecurity.twoFACodeExpiresAt < new Date()) {
      logger.warn("⛔ Код истёк", { expiresAt: userSecurity.twoFACodeExpiresAt });
      await UserSecurityModel.updateOne(
        { userId },
        { $unset: { twoFACodeHash: "", twoFACodeExpiresAt: "" } }
      );
      throw ApiError.BadRequest("Код истёк. Запросите новый.");
    }

    const isValid = isCodeMatch(inputCode, userSecurity.twoFACodeHash);

    if (!isValid) {
      logger.warn("⛔ Неверный код", { userId });
      await UserSecurityModel.updateOne(
        { userId },
        { $inc: { twoFAAttempts: 1 } }
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
      twoFALastAttempt: null 
    },
  }
);


    const freshUser = await UserModel.findById(userId);

    const userDto = new UserDTO(freshUser);

    return { user: userDto, freshUser };
  } catch (error) {
    logger.error("⛔ Ошибка при проверке 2FA кода", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: error.status,
      errors: error.errors,
    });
    throw error;
  }
};

// Функция для создания сессии после успешной верификации
const createSessionAfter2FA = async (userDto, freshUser, deviceType, ip, device) => {
  try {
    const tokens = tokenService.generateToken({ ...userDto });

    const sessionPayload = {
      userId: freshUser._id,
      refreshToken: tokens.refreshToken,
      deviceId: device?.deviceId ?? null,
      deviceType: deviceType || null,
      deviceModel: device?.model || null,
      os: device?.os || null,
      osVersion: device?.osVersion || null,
      ip: ip || null,
    };

    const session = await createOrUpdateSession(sessionPayload);

    return {
      ...tokens,
      user: userDto,
      sendNotification: true,
      email: freshUser.email,
    };
  } catch (error) {
    logger.error("⛔ Ошибка при создании сессии после 2FA", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER, 10) || 5;

async function createOrUpdateSession({
  userId,
  refreshToken,
  deviceId = null,
  deviceType = null,
  deviceModel = null,
  os = null,
  osVersion = null,
  ip = null,
}) {
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
  const session = await UserSessionModel.findOneAndUpdate(filter, update, options).exec();

  // После успешного создания/обновления — принудительная очистка старых сессий
  await pruneSessions(userId, MAX_SESSIONS_PER_USER);

  return session;
}

async function pruneSessions(userId, maxSessions) {
  // Ищем все неотозванные сессии, сортируем по lastUsedAt (старые первыми)
  const sessions = await UserSessionModel.find({ userId, revoked: false })
    .sort({ lastUsedAt: -1 }) // самые новые в начале
    .skip(maxSessions)
    .exec();

  if (sessions && sessions.length) {
    const ids = sessions.map((s) => s._id);
    await UserSessionModel.updateMany(
      { _id: { $in: ids } },
      { $set: { revoked: true } }
    );
    // логируем
    logger.info("Pruned sessions", { userId, count: ids.length });
  }
}


// Обновленная основная функция (для обратной совместимости)
const verify2FACode = async (userId, inputCode, deviceType, ip, device) => {

  try {
    // Используем новую функцию для верификации
    const { user: userDto, freshUser } = await verify2FACodeOnly(userId, inputCode);
    
    // Создаем сессию
    const result = await createSessionAfter2FA(userDto, freshUser, deviceType, ip, device);
    
    return result;
  } catch (error) {
    logger.error("⛔ Ошибка в verify2FACode", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = {
  create2FACodeAndNotify,
  create2FACodeTransaction,
  verify2FACode,
  verify2FACodeOnly,  
  createSessionAfter2FA
};
