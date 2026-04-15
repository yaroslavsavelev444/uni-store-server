const mongoose = require("mongoose");
const ApiError = require("../exceptions/api-error");
const {
  UserModel,
  UserSecurityModel,
  UserSessionModel,
  AccountDeletionRequestModel,
} = require("../models/index.models");
const { sendEmailNotification } = require("../queues/taskQueues");
const logger = require("../logger/logger");
const UserDTO = require("../dtos/user.dto");
const tokenService = require("./tokenService");
const redisClient = require("../redis/redis.client");
const crypto = require("crypto");
const {
  generate2FACode,
  hashCode,
  isCodeMatch,
} = require("../utils/generators");
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

    if (!userData) {
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
      logger.warn("⛔ Превышено количество попыток", {
        userId,
        attempts: userSecurity.twoFAAttempts,
      });
      throw ApiError.TooManyRequests("Превышено количество попыток ввода кода");
    }

    if (userSecurity.twoFACodeExpiresAt < new Date()) {
      logger.warn("⛔ Код истёк", {
        expiresAt: userSecurity.twoFACodeExpiresAt,
      });
      await UserSecurityModel.updateOne(
        { userId },
        { $unset: { twoFACodeHash: "", twoFACodeExpiresAt: "" } },
      );
      throw ApiError.BadRequest("Код истёк. Запросите новый.");
    }

    const isValid = isCodeMatch(inputCode, userSecurity.twoFACodeHash);

    if (!isValid) {
      logger.warn("⛔ Неверный код", { userId });
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
const createSessionAfter2FA = async (
  userDto,
  freshUser,
  deviceType,
  ip,
  device,
) => {
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

const MAX_SESSIONS_PER_USER =
  parseInt(process.env.MAX_SESSIONS_PER_USER, 10) || 5;

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
  const session = await UserSessionModel.findOneAndUpdate(
    filter,
    update,
    options,
  ).exec();

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
      { $set: { revoked: true } },
    );
    // логируем
    logger.info("Pruned sessions", { userId, count: ids.length });
  }
}

// Обновленная основная функция (для обратной совместимости)
const verify2FACode = async (userId, inputCode, deviceType, ip, device) => {
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
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// services/2faService.js (исправленный)

const createDeletion2FACode = async (deletionRequestId, userId, email) => {
  try {
    const code = generate2FACode();
    const hashedCode = hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const deletionRequest = await AccountDeletionRequestModel.findByIdAndUpdate(
      deletionRequestId,
      {
        $set: {
          "twoFactorVerification.enabled": true,
          "twoFactorVerification.codeHash": hashedCode,
          "twoFactorVerification.codeExpiresAt": expiresAt,
          "twoFactorVerification.attempts": 0,
          verificationMethod: "email",
          status: "pending_verification",
        },
      },
      { new: true },
    );

    if (!deletionRequest) {
      throw ApiError.NotFoundError("Запрос на удаление не найден");
    }

    await sendEmailNotification(email, "deletion_confirmation", {
      code,
      requestType: deletionRequest.requestType,
      requestId: deletionRequestId,
      expiresInMinutes: 10,
    });

    logger.info({
      msg: "2FA код для удаления аккаунта создан",
      email,
      code,
      requestType: deletionRequest.requestType,
      requestId: deletionRequestId,
      expiresInMinutes: 10,
    });

    return {
      success: true,
      deletionRequestId,
      expiresAt,
      message: "Код подтверждения отправлен на email",
    };
  } catch (error) {
    logger.error({
      name: error.name,
      msg: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

const verifyDeletion2FACode = async (deletionRequestId, inputCode, userIp) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const deletionRequest =
      await AccountDeletionRequestModel.findById(deletionRequestId).session(
        session,
      );

    if (!deletionRequest) {
      throw ApiError.NotFoundError("Запрос на удаление не найден");
    }

    if (deletionRequest.status !== "pending_verification") {
      throw ApiError.BadRequest("Запрос не требует верификации");
    }

    const twoFA = deletionRequest.twoFactorVerification;

    if (!twoFA.enabled || !twoFA.codeHash) {
      throw ApiError.BadRequest("2FA не инициализирован для этого запроса");
    }

    if (twoFA.attempts >= twoFA.maxAttempts) {
      throw ApiError.TooManyRequestsError(
        "Превышено количество попыток ввода кода",
      );
    }

    if (new Date() > twoFA.codeExpiresAt) {
      await AccountDeletionRequestModel.findByIdAndUpdate(
        deletionRequestId,
        {
          $set: {
            "twoFactorVerification.enabled": false,
            "twoFactorVerification.codeHash": null,
            "twoFactorVerification.codeExpiresAt": null,
          },
        },
        { session },
      );
      throw ApiError.BadRequest("Код истёк. Запросите новый.");
    }

    const isValid = isCodeMatch(inputCode, twoFA.codeHash);

    if (!isValid) {
      await AccountDeletionRequestModel.findByIdAndUpdate(
        deletionRequestId,
        {
          $inc: { "twoFactorVerification.attempts": 1 },
        },
        { session },
      );
      throw ApiError.BadRequest("Неверный код подтверждения");
    }

    deletionRequest.status = "verified";
    deletionRequest.twoFactorCompleted = true;
    deletionRequest.verificationDate = new Date();

    if (deletionRequest.twoFactorVerification) {
      deletionRequest.twoFactorVerification.verifiedAt = new Date();
    }

    deletionRequest.waitPeriodStart = new Date();
    deletionRequest.waitPeriodEnd = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    );

    const cancellationToken = crypto.randomBytes(32).toString("hex");
    deletionRequest.cancellationToken = cancellationToken;
    deletionRequest.cancellationTokenExpires = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    );

    // ✅ ИСПРАВЛЕНО: поле в модели называется "user", не "userId"
    const userId = deletionRequest.user;

    deletionRequest.actions.push({
      action: "2fa_verified",
      performedBy: userId,
      timestamp: new Date(),
      details: {
        ip: userIp,
        method: deletionRequest.verificationMethod,
      },
    });

    await deletionRequest.save({ session });

    await UserModel.findByIdAndUpdate(
      deletionRequest.user, // ✅ исправлено
      {
        status: "deactivation_pending",
        deactivationStartDate: new Date(),
        cancellationToken: cancellationToken,
        cancellationTokenExpires: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ),
      },
      { session },
    );

    await session.commitTransaction();

    logger.info({
      msg: "2FA код для удаления аккаунта верифицирован",
      deletionRequestId,
      inputCode,
      requestType: deletionRequest.requestType,
    });

    const user = await UserModel.findById(deletionRequest.user);
    if (user && user.email) {
      await sendEmailNotification(user.email, "deletion_confirmed", {
        requestId: deletionRequestId,
        requestType: deletionRequest.requestType,
        waitPeriodEnd: deletionRequest.waitPeriodEnd,
        cancellationToken,
      });
    }

    return {
      success: true,
      deletionRequestId,
      status: deletionRequest.status,
      waitPeriodEnd: deletionRequest.waitPeriodEnd,
      cancellationToken,
      message: "Запрос подтвержден. У вас есть 30 дней для отмены.",
    };
  } catch (error) {
    await session.abortTransaction();
    logger.error({
      name: error.name,
      msg: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    session.endSession();
  }
};

const resendDeletion2FACode = async (deletionRequestId) => {
  try {
    // ✅ исправлено: поле "user", а не "userId"
    const deletionRequest = await AccountDeletionRequestModel.findById(
      deletionRequestId,
    ).populate("user", "email");

    if (!deletionRequest) {
      throw ApiError.NotFoundError("Запрос на удаление не найден");
    }

    if (deletionRequest.status !== "pending_verification") {
      throw ApiError.BadRequest("Невозможно повторно отправить код");
    }

    if (deletionRequest.twoFactorVerification.attempts >= 3) {
      throw ApiError.TooManyRequestsError(
        "Слишком много попыток. Попробуйте позже.",
      );
    }

    return await createDeletion2FACode(
      deletionRequestId,
      deletionRequest.user._id,
      deletionRequest.user.email,
    );
  } catch (error) {
    logger.error({
      name: error.name,
      msg: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

const cancelDeletion2FA = async (deletionRequestId, userId) => {
  try {
    // ✅ исправлено: поле "user", а не "userId"
    const deletionRequest = await AccountDeletionRequestModel.findOneAndUpdate(
      {
        _id: deletionRequestId,
        user: userId,
        status: "pending_verification",
      },
      {
        $set: {
          status: "cancelled",
          cancellationDate: new Date(),
          "twoFactorVerification.enabled": false,
          "twoFactorVerification.codeHash": null,
          "twoFactorVerification.codeExpiresAt": null,
        },
        $push: {
          actions: {
            action: "2fa_cancelled",
            performedBy: userId,
            timestamp: new Date(),
            details: { reason: "user_cancelled" },
          },
        },
      },
      { new: true },
    );

    if (!deletionRequest) {
      throw ApiError.NotFoundError("Запрос не найден или уже обработан");
    }

    return {
      success: true,
      message: "Верификация отменена",
      deletionRequestId,
    };
  } catch (error) {
    logger.error({
      name: error.name,
      msg: error.message,
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
  createSessionAfter2FA,
  verifyDeletion2FACode,
  resendDeletion2FACode,
  cancelDeletion2FA,
  createDeletion2FACode,
};
