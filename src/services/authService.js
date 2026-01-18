const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
const {
  UserModel,
  UserSecurityModel,
  UserSessionModel,
  UserAcceptedConsentModel,
} = require("../models/index.models");
const { registerSchema } = require("../validators/user.validator");
const bcrypt = require("bcryptjs");
const {
  create2FACodeAndNotify,
  verify2FACode,
  verify2FACodeOnly,
} = require("./2faService");
const UserDTO = require("../dtos/user.dto");
const {
  validateRefreshToken,
  generateToken,
  validateAccessToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} = require("./tokenService");
const moveFileToFinal = require("../utils/moveFileToFinal");
const {
  sendEmailNotification,
  sendPushNotification,
} = require("../queues/taskQueues");
const { login_from_new_device } = require("../templates/templates");
const redisClient = require("../redis/redis.client");
const SessionService = require("./SessionService");
const userSanctionService = require("./userSanctionService");

const login = async (userData) => {
  try {
    const { password } = userData;
    const email = userData.email.toLowerCase().trim();
    const user = await UserModel.findOne({ email }).select("+password").exec();
    if (!user) {
      throw ApiError.BadRequest("Пользователь не найден");
    }

    //Заблокирован ли 
    const sanctionData = await userSanctionService.checkUserBlockStatus(user._id);

    if (sanctionData.user.status === "blocked") {
      throw ApiError.ForbiddenError("Пользователь заблокирован");
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw ApiError.BadRequest("Неверный пароль");
    }

    await create2FACodeAndNotify(user._id);
    await redisClient.del(`login:email:${email}`);
    await redisClient.del(`login:email:${user._id}`);
    return {
      twoFAInitiated: true,
      userData: { userId: user._id, email: user.email },
    };
  } catch (error) {
    logger.error(`[LOGIN] ${error.message}`);
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.BadRequest(error.message);
    }
  }
};

const logout = async (refreshToken, userData) => {
  try {
    const user = await UserModel.findById(userData.id);
    if (!user) {
      throw ApiError.BadRequest("Пользователь не найден");
    }

    const session = await UserSessionModel.findOne({
      userId: user._id,
      refreshToken,
    });

    if (!session) {
      throw ApiError.BadRequest("Сессия пользователя не найдена");
    }

    session.revoked = true;
    await session.save();

    return { logout: true };
  } catch (error) {
    logger.error(`[LOGOUT] ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError(error.message);
  }
};


const register = async (userData, meta = {}) => {
  try {
    const { error, value } = registerSchema.validate(userData, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map(d => d.message).join("; ");
      throw ApiError.BadRequest("Ошибка валидации: " + details);
    }

    const { name, email, password, acceptedConsents } = value;

    const existingUser = await UserModel.findOne({ email }).exec();
    if (existingUser) {
      throw ApiError.BadRequest(
        "Пользователь с таким email уже существует"
      );
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = new UserModel({
      name,
      email,
      role: "user",
      password: hashedPassword,
    });

    const userSecurity = new UserSecurityModel({
      userId: user._id,
    });

    await Promise.all([user.save(), userSecurity.save()]);

    // === СОХРАНЕНИЕ ПРИНЯТЫХ СОГЛАСИЙ ===
    if (Array.isArray(acceptedConsents) && acceptedConsents.length > 0) {
      const consentDocs = acceptedConsents.map(consent => ({
        userId: user._id,
        consentSlug: consent.slug,
        consentVersion: consent.version,
        ip: meta.ip || "unknown",
        userAgent: meta.userAgent || "unknown",
      }));

      await UserAcceptedConsentModel.insertMany(
        consentDocs,
        { ordered: false }
      );
    }

    return {
      user: {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    logger.error(`[REGISTER] ${error.message}`);

    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.InternalServerError(
      "Произошла ошибка при регистрации",
      error
    );
  }
};

//VERIFIERS
const verify2FAAndNotify = async (
  userId,
  inputCode,
  deviceType,
  ip,
  device
) => {
  try {
    const result = await verify2FACode(
      userId,
      inputCode,
      deviceType,
      ip,
      device
    );

    if (result.sendNotification) {
      await redisClient.del(`verify:fa:email:${result.email}`);
      const loginDate = new Date();

      sendEmailNotification(result.email, "newLogin", {
        ip,
        deviceType,
        deviceModel: device.deviceModel,
        os: device.os,
        osVersion: device.osVersion,
        date: loginDate,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.log(error);
    logger.error("Неизвестная ошибка в verify2FAAndNotify", {
      originalError: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });

    throw ApiError.InternalServerError("Не удалось проверить код 2FA");
  }
};

const refreshService = async (refreshToken, deviceType, ip) => {
  if (!refreshToken) {
    throw ApiError.UnauthorizedError("Refresh token не предоставлен");
  }

  try {
    // 1. Сначала проверяем отзыв токена в Redis
    const isRevoked = await SessionService.isSessionRevoked(refreshToken);
    if (isRevoked) {
      logger.warn("Refresh attempt with revoked token", { ip });
      throw ApiError.UnauthorizedError(
        "Сессия была отозвана. Пожалуйста, войдите снова."
      );
    }

    // 2. Ищем сессию в базе данных
    const existingSession = await UserSessionModel.findOne({
      refreshToken: refreshToken,
    });

    if (!existingSession) {
      logger.warn("Refresh attempt with non-existent session", { ip });
      throw ApiError.UnauthorizedError("Сессия не найдена");
    }

    if (existingSession.revoked) {
      logger.warn("Refresh attempt with revoked session", {
        userId: existingSession.userId,
        ip,
      });
      throw ApiError.UnauthorizedError("Сессия была отозвана");
    }

    // 3. Валидируем refresh token
    const userData = validateRefreshToken(refreshToken); // ДОБАВИЛ AWAIT!
    if (!userData) {
      logger.warn("Invalid refresh token provided", {
        userId: existingSession.userId,
        ip,
      });
      throw ApiError.UnauthorizedError("Недействительный токен");
    }

    // 4. Проверяем существование пользователя
    const user = await UserModel.findById(userData.id);
    if (!user) {
      logger.warn("User not found during refresh", {
        userId: userData.id,
        ip,
      });
      throw ApiError.UnauthorizedError("Пользователь не найден");
    }

    // 6. Генерация новых токенов
    const userObj = { ...user.toObject() };
    const userDto = new UserDTO(userObj);
    const tokens = generateToken({ ...userDto });

    // 7. Обновляем сессию в базе данных АТОМАРНО
    const updatedSession = await UserSessionModel.findOneAndUpdate(
      {
        _id: existingSession._id,
        refreshToken: refreshToken, // Защита от race condition
      },
      {
        $set: {
          refreshToken: tokens.refreshToken,
          lastUsedAt: new Date(),
          ip: ip,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedSession) {
      logger.error("Session update failed - possible race condition", {
        sessionId: existingSession._id,
        userId: user.id,
      });
      throw ApiError.InternalServerError("Ошибка обновления сессии");
    }

    // 8. Добавляем старый токен в blacklist на короткое время
    // для предотвращения повторного использования
    await SessionService.addToTempBlacklist(refreshToken, 60); // 60 секунд

    logger.info("Tokens refreshed successfully", {
      userId: user.id,
      sessionId: existingSession._id,
      ip,
    });

    return {
      ...tokens,
      user: userDto,
    };
  } catch (error) {
    logger.error("Error in refreshService:", {
      error: error.message,
      stack: error.stack,
      ip,
    });

    // Если это наша кастомная ошибка - пробрасываем как есть
    if (error instanceof ApiError) {
      throw error;
    }

    // Для неизвестных ошибок - общая ошибка сервера
    throw ApiError.InternalServerError("Не удалось обновить токены");
  }
};

const getSessions = async (userId) => {
  try {
    const sessions = await UserSessionModel.find({ userId, revoked: false });
    return sessions;
  } catch (error) {
    logger.error("Ошибка в getSessions:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Не удалось получить сессии");
  }
};

const updateUser = async (userId, userData, files) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.BadRequest("Пользователь не найден");

    const allowedFields = ["name", "avatarUrl"];
    const updatePayload = {};

    // Безопасная проверка свойств
    if (userData && typeof userData === "object") {
      for (const key of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(userData, key)) {
          updatePayload[key] = userData[key];
        }
      }
    }

    // Обработка файла ДО обновления
    if (files?.avatar?.[0]) {
      const uploadedFile = files.avatar[0];
      const tempFilePath = uploadedFile.path;
      const finalFilePath = path.join(
        __dirname,
        "..",
        "uploads",
        "users",
        uploadedFile.filename
      );

      await moveFileToFinal(tempFilePath, finalFilePath);

      // Добавляем в payload для обновления
      updatePayload.avatarUrl = path.join(
        "uploads",
        "users",
        uploadedFile.filename
      );
    }

    // Проверка после добавления аватара
    if (Object.keys(updatePayload).length === 0) {
      throw ApiError.BadRequest("Нет допустимых данных для обновления");
    }

    // Единое обновление со всеми данными
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updatePayload },
      { new: true, runValidators: true } // Добавлены валидаторы
    );

    return updatedUser;
  } catch (error) {
    logger.error("Ошибка в updateUser:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError(
      "Не удалось обновить данные пользователя"
    );
  }
};

const changePassword = async (userId, oldPassword, newPassword) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.NotFoundError("Пользователь не найден");

    const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordCorrect) throw ApiError.BadRequest("Неправильный пароль");

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    //TODO увеломление
    return user;
  } catch (error) {
    logger.error("Ошибка в changePassword:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Не удалось изменить пароль");
  }
};

const revokeSession = async (userId, sessionId) => {
  try {
    const userData = await UserModel.findById(userId);
    if (!userData) throw ApiError.NotFoundError("Пользователь не найден");

    const session = await UserSessionModel.findById(sessionId);
    if (!session) throw ApiError.NotFoundError("Сессия не найдена");
    session.revoked = true;
    await session.save();
    return session;
  } catch (error) {
    logger.error("Ошибка в revokeSession:", error);
    if (error instanceof ApiError) throw error;
    throw ApiError.InternalServerError("Не удалось заблокировать сессию");
  }
};

const checkService = async (accessToken, refreshToken, deviceType, ip) => {
  console.log(
    "checkService called",
    !!accessToken,
    !!refreshToken,
    deviceType,
    ip
  );

  if (!accessToken || !refreshToken) {
    throw ApiError.BadRequest("Отсутствуют токены авторизации");
  }

  const refreshData = validateRefreshToken(refreshToken);

  if (!refreshData) {
    throw ApiError.UnauthorizedError("Refresh токен недействителен");
  }

  const user = await UserModel.findById(refreshData.id);
  if (!user) throw ApiError.UnauthorizedError("Пользователь не найден");

  let session = await UserSessionModel.findOne({
    userId: user._id,
    refreshToken,
  });

  if (!session || session.revoked) {
    throw ApiError.UnauthorizedError("Сессия недействительна");
  }

  // Обновляем последнюю активность
  session.lastUsedAt = new Date();
  if (ip) session.ip = ip;
  if (deviceType) session.deviceType = deviceType;
  await session.save();

  const accessData = validateAccessToken(accessToken);

  // ✅ Если accessToken валиден и принадлежит тому же пользователю - возвращаем как есть
  if (accessData && String(accessData.id) === String(refreshData.id)) {
    return {
      accessToken,
      refreshToken, // не меняем refreshToken
      user: new UserDTO(user),
    };
  }

  // 🔄 Если accessToken истек или невалиден, но refreshToken валиден - выдаем новый accessToken
  const userDto = new UserDTO(user);
  const { accessToken: newAccess } = generateToken(
    { ...userDto },
    { onlyAccess: true }
  );

  return {
    accessToken: newAccess,
    refreshToken, // refreshToken оставляем прежним
    user: userDto,
  };
};

const initiatePasswordReset = async (userEmail) => {
  const user = await UserModel.findOne({ email: userEmail });
  if (!user) throw ApiError.NotFoundError("Пользователь не найден");
  await create2FACodeAndNotify(user._id);
  return;
};

const completePasswordReset = async (email, resetToken, newPassword) => {
  // Верифицируем токен и получаем userId из токена
  const { userId } = await verifyPasswordResetToken(resetToken);

  // Проверяем, что email соответствует userId из токена (дополнительная безопасность)
  const userData = await UserModel.findOne({ _id: userId });
  if (!userData) throw ApiError.NotFoundError("Пользователь не найден");

  if (userData.email !== email) {
    throw ApiError.BadRequest("Email не соответствует токену сброса");
  }

  // Хэшируем новый пароль
  const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 12;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // Атомарно обновляем пароль и очищаем токен
  await Promise.all([
    UserModel.updateOne({ _id: userId }, { password: hashedPassword }),
    UserSecurityModel.updateOne(
      { userId },
      {
        $unset: {
          resetTokenHash: "",
          resetTokenExpiration: "",
        },
        $set: {
          resetTokenStatus: "completed",
          updatedAt: new Date(),
        },
      }
    ),
  ]);

  await sendPushNotification({
    userId: userData._id,
    title: "Ваш пароль успешно обновлен",
    body: "Если вы этого не совершали - срочно поменяйте пароль",
  });
  await sendEmailNotification(userData.email, "resetPasswordCompleted", {
    name: userData.name,
    email: userData.email,
  });
  // Инвалидируем все активные сессии пользователя
  await SessionService.invalidateAllSessionsExceptCurrent(userId);

  return { success: true };
};

const verifyPasswordResetCode = async (email, code) => {
  const userData = await UserModel.findOne({ email: email }); //
  if (!userData)
    throw ApiError.NotFoundError("Пользователь не найден sdfsfsfs");

  const { user } = await verify2FACodeOnly(userData._id, code);
  const signedToken = await generatePasswordResetToken(user.id);
  await sendPushNotification({
    userId: user.id,
    title: "Зафиксирована попытка восстановления пароля",
    body: "Системой отправлен код для восстановления пароля, если вы не запрашивали его - проигнорируйте",
  });
  return { resetToken: signedToken, user };
};

const resendResetCode = async (email) => {
  try {
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Для безопасности возвращаем успех даже если пользователь не найден
      return { ok: true, message: "Код отправлен повторно" };
    }

    // Проверяем, не слишком ли часто запрашивается повторная отправка
    const userSecurity = await UserSecurityModel.findOne({ userId: user._id });

    if (userSecurity && userSecurity.resetTokenExpiration) {
      const timeSinceLastRequest =
        Date.now() - userSecurity.resetTokenExpiration.getTime();

      // Не позволяем запрашивать новый код чаще чем раз в 1 минуту
      if (timeSinceLastRequest < 60000) {
        throw ApiError.BadRequest(
          "Новый код можно запросить только через 1 минуту после предыдущего"
        );
      }
    }

    await initiatePasswordReset(email);

    return {
      ok: true,
      message: "Код отправлен повторно",
    };
  } catch (error) {
    logger.error("Error resending reset code", {
      email: email.substring(0, 3) + "***",
      error: error.message,
    });
    throw error;
  }
};

const updateOnlineStatusService = async (userId, online) => {
  const userData = await UserModel.findById(userId);
  if (!userData) {
    throw ApiError.BadRequest("Пользователь не найден");
  }
  await UserModel.findByIdAndUpdate(userId, { online }, { new: true });
};

module.exports = {
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
