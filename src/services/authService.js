import { compare, hash } from "bcryptjs";
import UserDTO from "../dtos/user.dto";
import ApiError, {
  BadRequest,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from "../exceptions/api-error";
import { error as _error, info, warn } from "../logger/logger";
import {
  UserAcceptedConsentModel,
  UserModel,
  UserSecurityModel,
  UserSessionModel,
} from "../models/index.models";
import {
  sendEmailNotification,
  sendPushNotification,
} from "../queues/taskQueues";
import { del } from "../redis/redis.client";
import moveFileToFinal from "../utils/moveFileToFinal";
import { registerSchema } from "../validators/user.validator";
import {
  create2FACodeAndNotify,
  verify2FACode,
  verify2FACodeOnly,
} from "./2faService";
import {
  addToTempBlacklist,
  invalidateAllSessionsExceptCurrent,
  isSessionRevoked,
} from "./SessionService";
import {
  generatePasswordResetToken,
  generateToken,
  validateAccessToken,
  validateRefreshToken,
  verifyPasswordResetToken,
} from "./tokenService";
import { checkUserBlockStatus } from "./userSanctionService";

const login = async (userData) => {
  try {
    const { password } = userData;
    const email = userData.email.toLowerCase();

    const user = await UserModel.findOne({ email }).select("+password").exec();

    if (!user) {
      throw BadRequest("Пользователь не найден");
    }

    //Заблокирован ли
    const sanctionData = await checkUserBlockStatus(user._id);

    if (sanctionData.user.status === "blocked") {
      throw ForbiddenError("Пользователь заблокирован");
    }
    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      throw BadRequest("Неверный пароль");
    }

    await create2FACodeAndNotify(user._id);
    await del(`login:email:${email}`);
    await del(`login:email:${user._id}`);
    return {
      twoFAInitiated: true,
      userData: { userId: user._id, email: user.email },
    };
  } catch (error) {
    _error(`[LOGIN] ${error.message}`);
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw BadRequest(error.message);
    }
  }
};

const logout = async (refreshToken, userData) => {
  try {
    const user = await UserModel.findById(userData.id);
    if (!user) {
      throw BadRequest("Пользователь не найден");
    }

    const session = await UserSessionModel.findOne({
      userId: user._id,
      refreshToken,
    });

    if (!session) {
      throw BadRequest("Сессия пользователя не найдена");
    }

    session.revoked = true;
    await session.save();

    return { logout: true };
  } catch (error) {
    _error(`[LOGOUT] ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw InternalServerError(error.message);
  }
};

const register = async (userData, meta = {}) => {
  try {
    const { error, value } = registerSchema.validate(userData, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join("; ");
      throw BadRequest("Ошибка валидации: " + details);
    }

    const { name, password, acceptedConsents } = value;

    const email = value.email.toLowerCase();

    const existingUser = await UserModel.findOne({ email }).exec();
    if (existingUser) {
      throw BadRequest("Пользователь с таким email уже существует");
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;
    const hashedPassword = await hash(password, saltRounds);

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
      const consentDocs = acceptedConsents.map((consent) => ({
        userId: user._id,
        consentSlug: consent.slug,
        consentVersion: consent.version,
        ip: meta.ip || "unknown",
        userAgent: meta.userAgent || "unknown",
      }));

      await UserAcceptedConsentModel.insertMany(consentDocs, {
        ordered: false,
      });
    }

    return {
      user: {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    _error(`[REGISTER] ${error.message}`);

    if (error instanceof ApiError) {
      throw error;
    }

    throw InternalServerError("Произошла ошибка при регистрации", error);
  }
};

//VERIFIERS
const verify2FAAndNotify = async (
  userId,
  inputCode,
  deviceType,
  ip,
  device,
) => {
  try {
    const result = await verify2FACode(
      userId,
      inputCode,
      deviceType,
      ip,
      device,
    );

    if (result.sendNotification) {
      await del(`verify:fa:email:${result.email}`);
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
    _error("Неизвестная ошибка в verify2FAAndNotify", {
      originalError: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });

    throw InternalServerError("Не удалось проверить код 2FA");
  }
};

const refreshService = async (refreshToken, deviceType, ip) => {
  if (!refreshToken) {
    throw UnauthorizedError("Refresh token не предоставлен");
  }

  try {
    // 1. Сначала проверяем отзыв токена в Redis
    const isRevoked = await isSessionRevoked(refreshToken);
    if (isRevoked) {
      warn("Refresh attempt with revoked token", { ip });
      throw UnauthorizedError(
        "Сессия была отозвана. Пожалуйста, войдите снова.",
      );
    }

    // 2. Ищем сессию в базе данных
    const existingSession = await UserSessionModel.findOne({
      refreshToken: refreshToken,
    });

    if (!existingSession) {
      warn("Refresh attempt with non-existent session", { ip });
      throw UnauthorizedError("Сессия не найдена");
    }

    if (existingSession.revoked) {
      warn("Refresh attempt with revoked session", {
        userId: existingSession.userId,
        ip,
      });
      throw UnauthorizedError("Сессия была отозвана");
    }

    // 3. Валидируем refresh token
    const userData = validateRefreshToken(refreshToken); // ДОБАВИЛ AWAIT!
    if (!userData) {
      warn("Invalid refresh token provided", {
        userId: existingSession.userId,
        ip,
      });
      throw UnauthorizedError("Недействительный токен");
    }

    // 4. Проверяем существование пользователя
    const user = await UserModel.findById(userData.id);
    if (!user) {
      warn("User not found during refresh", {
        userId: userData.id,
        ip,
      });
      throw UnauthorizedError("Пользователь не найден");
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
      },
    );

    if (!updatedSession) {
      _error("Session update failed - possible race condition", {
        sessionId: existingSession._id,
        userId: user.id,
      });
      throw InternalServerError("Ошибка обновления сессии");
    }

    // 8. Добавляем старый токен в blacklist на короткое время
    // для предотвращения повторного использования
    await addToTempBlacklist(refreshToken, 60); // 60 секунд

    info("Tokens refreshed successfully", {
      userId: user.id,
      sessionId: existingSession._id,
      ip,
    });

    return {
      ...tokens,
      user: userDto,
    };
  } catch (error) {
    _error("Error in refreshService:", {
      error: error.message,
      stack: error.stack,
      ip,
    });

    // Если это наша кастомная ошибка - пробрасываем как есть
    if (error instanceof ApiError) {
      throw error;
    }

    // Для неизвестных ошибок - общая ошибка сервера
    throw InternalServerError("Не удалось обновить токены");
  }
};

const getSessions = async (userId) => {
  try {
    const sessions = await UserSessionModel.find({ userId, revoked: false });
    return sessions;
  } catch (error) {
    _error("Ошибка в getSessions:", error);
    if (error instanceof ApiError) throw error;
    throw InternalServerError("Не удалось получить сессии");
  }
};

const updateUser = async (userId, userData, files) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) throw BadRequest("Пользователь не найден");

    const allowedFields = ["name", "avatarUrl"];
    const updatePayload = {};

    // Безопасная проверка свойств
    if (userData && typeof userData === "object") {
      for (const key of allowedFields) {
        if (Object.hasOwn(userData, key)) {
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
        uploadedFile.filename,
      );

      await moveFileToFinal(tempFilePath, finalFilePath);

      // Добавляем в payload для обновления
      updatePayload.avatarUrl = path.join(
        "uploads",
        "users",
        uploadedFile.filename,
      );
    }

    // Проверка после добавления аватара
    if (Object.keys(updatePayload).length === 0) {
      throw BadRequest("Нет допустимых данных для обновления");
    }

    // Единое обновление со всеми данными
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updatePayload },
      { new: true, runValidators: true }, // Добавлены валидаторы
    );

    return updatedUser;
  } catch (error) {
    _error("Ошибка в updateUser:", error);
    if (error instanceof ApiError) throw error;
    throw InternalServerError("Не удалось обновить данные пользователя");
  }
};

const changePassword = async (userId, oldPassword, newPassword) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) throw NotFoundError("Пользователь не найден");

    const isPasswordCorrect = await compare(oldPassword, user.password);
    if (!isPasswordCorrect) throw BadRequest("Неправильный пароль");

    user.password = await hash(newPassword, 10);
    await user.save();

    //TODO увеломление
    return user;
  } catch (error) {
    _error("Ошибка в changePassword:", error);
    if (error instanceof ApiError) throw error;
    throw InternalServerError("Не удалось изменить пароль");
  }
};

const revokeSession = async (userId, sessionId) => {
  try {
    const userData = await UserModel.findById(userId);
    if (!userData) throw NotFoundError("Пользователь не найден");

    const session = await UserSessionModel.findById(sessionId);
    if (!session) throw NotFoundError("Сессия не найдена");
    session.revoked = true;
    await session.save();
    return session;
  } catch (error) {
    _error("Ошибка в revokeSession:", error);
    if (error instanceof ApiError) throw error;
    throw InternalServerError("Не удалось заблокировать сессию");
  }
};

const checkService = async (accessToken, refreshToken, deviceType, ip) => {
  console.log(
    "checkService called",
    !!accessToken,
    !!refreshToken,
    deviceType,
    ip,
  );

  if (!accessToken || !refreshToken) {
    throw BadRequest("Отсутствуют токены авторизации");
  }

  const refreshData = validateRefreshToken(refreshToken);

  if (!refreshData) {
    throw UnauthorizedError("Refresh токен недействителен");
  }

  const user = await UserModel.findById(refreshData.id);
  if (!user) throw UnauthorizedError("Пользователь не найден");

  const session = await UserSessionModel.findOne({
    userId: user._id,
    refreshToken,
  });

  if (!session || session.revoked) {
    throw UnauthorizedError("Сессия недействительна");
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
    { onlyAccess: true },
  );

  return {
    accessToken: newAccess,
    refreshToken, // refreshToken оставляем прежним
    user: userDto,
  };
};

const initiatePasswordReset = async (email) => {
  const user = await UserModel.findOne({ email });
  if (!user) throw NotFoundError("Пользователь не найден");
  await create2FACodeAndNotify(user._id);
  return;
};

const completePasswordReset = async (email, resetToken, newPassword) => {
  // Верифицируем токен и получаем userId из токена
  const { userId } = await verifyPasswordResetToken(resetToken);

  // Проверяем, что email соответствует userId из токена (дополнительная безопасность)
  const userData = await UserModel.findOne({ _id: userId });
  if (!userData) throw NotFoundError("Пользователь не найден");

  if (userData.email !== email) {
    throw BadRequest("Email не соответствует токену сброса");
  }

  // Хэшируем новый пароль
  const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 12;
  const hashedPassword = await hash(newPassword, saltRounds);

  // Атомарно обновляем пароль и очищаем токен
  await Promise.all([
    UserModel.updateOne({ _id: userId, email }, { password: hashedPassword }),
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
      },
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
  await invalidateAllSessionsExceptCurrent(userId);

  return { success: true };
};

const verifyPasswordResetCode = async (email, code) => {
  const userData = await UserModel.findOne({ email });
  if (!userData)
    throw NotFoundError(
      "Пользователь не найден при подтвержлении восстановления пароля",
    );

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
        throw BadRequest(
          "Новый код можно запросить только через 1 минуту после предыдущего",
        );
      }
    }

    await initiatePasswordReset(email);

    return {
      ok: true,
      message: "Код отправлен повторно",
    };
  } catch (error) {
    _error("Error resending reset code", {
      email: email.substring(0, 3) + "***",
      error: error.message,
    });
    throw error;
  }
};

const updateOnlineStatusService = async (userId, online) => {
  const userData = await UserModel.findById(userId);
  if (!userData) {
    throw BadRequest("Пользователь не найден");
  }
  await UserModel.findByIdAndUpdate(userId, { online }, { new: true });
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
