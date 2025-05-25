const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const tokenService = require("./tokenService");
const UserDto = require("../dtoses/user.dto");
const ApiError = require("../exceptions/api-error");
const crypto = require("crypto");
const { sendEmailNotification } = require("../queues/taskQueues");
const {
  UserModel,
  CartModel,
} = require("../models/indexModels");
const { fullAddress } = require("../utils/serverInfo");
const { log } = require("console");

const isEmailExistsService = async (email) => {
  const user = await UserModel.findOne({ email });
  return { exists: !!user };
};

const registerUserService = async (
  email,
  phone,
  password,
  name,
  surname,
  role
) => {

  const candidate = await UserModel.findOne({
    $or: [{ email }, { phone }],
  });

  if (candidate) {
    if (candidate.email === email) {
      throw ApiError.BadRequest("Пользователь с таким email уже существует");
    } else {
      throw ApiError.BadRequest(
        "Пользователь с таким телефоном уже существует"
      );
    }
  }

  const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Генерируем JWT-токен для активации (срок жизни 24 часа)
  const emailToken = jwt.sign({ email }, process.env.JWT_ACTIVATION_SECRET, {
    expiresIn: "24h",
  });

  const user = await UserModel.create({
    email,
    phone,
    password: hashedPassword,
    name,
    surname,
    role: "user" ,
    activations: {
      emailToken: emailToken,
      emailTokenExpiration: Date.now() + 24 * 60 * 60 * 1000,
    },
  });

  try {
    sendEmailNotification(email, "confirmEmail", {
      username: user.name, 
      confirmationLink: `${fullAddress}/auth/verifyEmail?token=${emailToken}`,
    });
  } catch (error) {
    throw ApiError.InternalServerError(
      "Не удалось отправить письмо активации"
    );
  }
  return { status: "success", message: "sent" };
};

const checkVerifiedEmailService = async (email) => {
  const user = await UserModel.findOne({ email });
  if (user.activations.emailVerified === false) {
    if (!user) {
      throw ApiError.BadRequest("Пользователь не найден");
    }
    return { isVerified: user.activations.emailVerified };
  } else {
    const userDto = new UserDto(user);
    const tokens = tokenService.generateToken({ ...userDto });
    await tokenService.saveToken(userDto.id, tokens.refreshToken);
    return {
      ...tokens,
      user: userDto,
      isVerified: user.activations.emailVerified,
      userRole: user.role,
    };
  }
};

const verifyEmail = async (token) => {
  const decodedToken = decodeURIComponent(token);
  const decoded = jwt.verify(decodedToken, process.env.JWT_ACTIVATION_SECRET);
  const user = await UserModel.findOne({ email: decoded.email }).select(
    "+activations.emailToken"
  );

  if (!user) {
    console.log("User not found");
    throw ApiError.BadRequest("Пользователь не найден");
  }

  const expiration = new Date(user.activations.emailTokenExpiration).getTime();
  if (!expiration || expiration < Date.now()) {
    console.log("Token is expired");
    throw ApiError.BadRequest("Неверный или истекший токен активации");
  }

  if (user.activations.emailToken !== token) {
    throw ApiError.BadRequest("Неверный токен активации");
  }
  // Активация пользователя
  user.activations.emailVerified = true;
  user.activations.emailToken = null; // Очищаем токен после активации
  user.activations.emailTokenExpiration = null;

  await user.save();
  return { message: user.activations.emailVerified, message: "activated" };
};

const loginUserService = async (email, password) => {

  const user = await UserModel.findOne({ email });
  if (!user) {
    throw ApiError.BadRequest("Пользователь с таким email не найден");
  }
  if (!user.password) {
    throw ApiError.BadRequest(
      "Ошибка данных: отсутствует пароль у пользователя"
    );
  }

  const isPassEquals = await bcrypt.compare(password, user.password);
  if (!isPassEquals) {
    throw ApiError.BadRequest("Неверный пароль");
  }

  // ЕСЛИ ПОЛЬЗОВАТЕЛЬ НЕ АКТИВИРОВАН
  if (user.activations.emailVerified === false) {
    const emailToken = jwt.sign({ email }, process.env.JWT_ACTIVATION_SECRET, {
      expiresIn: "24h",
    });
    user.activations.emailToken = emailToken;
    user.activations.emailTokenExpiration = Date.now() + 86400000;
    await user.save();
    try {
      sendEmailNotification(email, "confirmEmail", {
        username: user.name, 
        confirmationLink: `${fullAddress}/auth/verifyEmail?token=${emailToken}`,
      });
    } catch (error) {
      throw ApiError.InternalServerError(
        "Не удалось отправить письмо активации"
      );
    }
    return { verified: false };
  }

  const userDto = new UserDto(user); // id, email, isActivated
  const tokens = tokenService.generateToken({ ...userDto });
  await tokenService.saveToken(userDto.id, tokens.refreshToken);
  return { ...tokens, user: userDto, verified: true };
};

const logoutUserService = async (refreshToken, accessToken) => {
  if (!refreshToken || !accessToken) {
    throw ApiError.UnauthorizedError();
  }
  const userData = await tokenService.validateAccessToken(accessToken);
  if (!userData) {
    throw ApiError.UnauthorizedError();
  }

  const token = await tokenService.removeToken(refreshToken);
  return token;
};

const refreshService = async (refreshToken ) => {
  if (!refreshToken) {
    throw ApiError.UnauthorizedError();
  }
  const userData = await tokenService.validateRefreshToken(refreshToken);
  const tokenFromDb = await tokenService.findToken(refreshToken);

  if (!userData || !tokenFromDb) throw ApiError.UnauthorizedError();

  const user = await UserModel.findById(userData.id);
  if (!user) {
    throw ApiError.UnauthorizedError();
  }

  const userDto = new UserDto(user);
  const tokens = tokenService.generateToken({ ...userDto });

  const cart = await CartModel.findOne({ user: userDto.id });

const totalQuantity = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

await tokenService.saveToken(userDto.id, tokens.refreshToken);

return {
  ...tokens,
  user: {
    ...userDto,
    cartQuantity: totalQuantity
  }
};
};

const checkService = async (accessToken, refreshToken) => {

  if (!refreshToken || !accessToken) {
    throw ApiError.UnauthorizedError();
  }

  // Проверяем валидность access и refresh токенов
  const accessData = await tokenService.validateAccessToken(accessToken);
  const refreshData = await tokenService.validateRefreshToken(refreshToken);

  // Проверяем, хранится ли refresh-токен в БД и к какому пользователю он относится
  const tokenFromDb = await tokenService.findToken(refreshToken);
  if (!refreshData || !tokenFromDb) {
    throw ApiError.UnauthorizedError();
  }

  // Проверяем, совпадает ли userId в refresh-токене и в БД
  const user = await UserModel.findById(refreshData.id);

  if (!user || String(user._id) !== String(tokenFromDb.user)) {
    throw ApiError.UnauthorizedError();
  }

  // Если access токен валиден и соответствует userId в refresh-токене, возвращаем старые токены
  if (accessData && String(accessData.id) === String(refreshData.id)) {
    return { accessToken, refreshToken, user: new UserDto(user)};
  }

  // Если access токен невалиден, но refresh токен валиден, создаем новые токены
  const userDto = new UserDto(user);
  const newTokens = tokenService.generateToken({ ...userDto });
  // Сохраняем новый refresh-токен в БД
  await tokenService.saveToken(userDto.id, newTokens.refreshToken);
  return { ...newTokens, user: userDto};
};

const changePasswordService = async ( 
  userId,
  oldPassword,
  newPassword
) => {

  const user = await UserModel.findById(userId);
  
  if (!user) {
    throw ApiError.BadRequest("Пользователь не найден");
  }

  if (!oldPassword) {
    throw ApiError.BadRequest("Не указан старый пароль");
  }

  const isPassEquals = await bcrypt.compare(oldPassword, user.password);
  if (!isPassEquals) {
    throw ApiError.BadRequest("Неверный старый пароль");
  }

  if (!newPassword) {
    throw ApiError.BadRequest("Не указан новый пароль");
  }

  const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  try {
    user.password = hashedPassword;
    await user.save();
  } catch (error) {
    throw ApiError.InternalServerError("Ошибка при сохранении нового пароля");
  }

  return { message: "Пароль успешно изменен" };
};

//Подтверждаем операцию смены и восстановления пароля после нажатия на ссылку в письме
const verifyResetPasswordService = async (resetTokenSigned) => {
  if (!resetTokenSigned) {
    throw ApiError.BadRequest("Токен сброса пароля отсутствует");
  }

  let decoded;
  try {
    decoded = jwt.verify(resetTokenSigned, process.env.JWT_RESET_SECRET_KEY);
  } catch (err) {
    console.error("Ошибка JWT-проверки:", err.message);
    throw ApiError.BadRequest("Недействительный или истекший токен");
  }

  const user = await UserModel.findOne({
    "tokens.resetToken": resetTokenSigned,
    "tokens.resetTokenExpiration": { $gt: Date.now() },
  });

  if (!user) {
    throw ApiError.BadRequest("Неверный или истекший токен");
  }

  user.tokens.resetTokenStatus = "verified";
  await user.save();

  return;
};

const forgotPasswordService = async (email) => {
  const user = await UserModel.findOne({ email });
  if (!user) {
    throw ApiError.NotFoundError("Пользователь не найден");
  }

  // Генерация безопасного токена
  const resetToken = crypto.randomBytes(32).toString("hex");

  // Подписываем токен JWT
  const tokenSigned = jwt.sign(
    { resetToken },
    process.env.JWT_RESET_SECRET_KEY,
    { expiresIn: "1h" }
  );

  if (!tokenSigned) {
    throw ApiError.InternalServerError("Ошибка при отправке письма");
  }

  // Сохраняем resetToken в базе данных
  user.tokens.resetToken = tokenSigned;
  user.tokens.resetTokenExpiration = Date.now() + 3600000; // 1 час
  user.tokens.resetTokenStatus = "pending";

  await user.save();

    try {
      sendEmailNotification(email, "resetPassword", {
        username: user.name,
        resetLink:`${fullAddress}/auth/verify-reset-password?token=${tokenSigned}`,
      });
    } catch (error) {
      throw ApiError.InternalServerError("Ошибка при отправке письма");
    }
    return {
      message: "sended",
    };
};

const checkVerifyStatusService = async (email) => {
  const user = await UserModel.findOne({ email });
  if (!user) {
    throw ApiError.BadRequest("Пользователь не найден");
  }
  return user.tokens.resetTokenStatus;
};

// const resetPasswordService = async (newPassword, email) => { //TODO адаптивровать под новый кейс 
//   if (!newPassword || !email) {
//     throw ApiError.BadRequest("Недостаточно данных для сброса пароля");
//   }

//   const passwordStrengthRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
//   if (!passwordStrengthRegex.test(newPassword)) {
//     throw ApiError.BadRequest(
//       "Пароль должен содержать минимум 8 символов, одну цифру и одну заглавную букву"
//     );
//   }

//   const user = await UserModel.findOne({ email }).select(
//     "+tokens.resetToken +tokens.resetTokenStatus +tokens.resetTokenExpiration"
//   );

//   if (!user) {
//     throw ApiError.BadRequest("Пользователь не найден");
//   }

//   const { resetToken, resetTokenStatus, resetTokenExpiration } =
//     user.tokens || {};

//   if (
//     resetTokenStatus !== "verified" ||
//     !resetTokenExpiration ||
//     resetTokenExpiration < Date.now() ||
//     !resetToken
//   ) {
//     throw ApiError.BadRequest("Неверный или истекший токен (этап 1)");
//   }

//   try {
//     jwt.verify(resetToken, process.env.JWT_RESET_SECRET_KEY);
//   } catch (err) {
//     console.error("Ошибка JWT-проверки:", err.message);
//     throw ApiError.BadRequest("Недействительный или истекший токен (этап 2)");
//   }


//   const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;
//   const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

//   user.password = hashedPassword;
//   user.tokens.resetToken = null;
//   user.tokens.resetTokenExpiration = null;
//   user.tokens.resetTokenStatus = null;
//   if (user.tokens.refreshToken) {
//     user.tokens.refreshToken = null;
//   }

//   await user.save();

//   await sendEmailNotification(user.email, "password-change", {
//     link: `https://yourdomain.com/login`,
//   });

//   console.log(
//     `[SECURITY] Пароль сброшен для ${email} — ${new Date().toISOString()}`
//   );

//   return { message: "Пароль успешно изменён" };
// };


module.exports = {
  registerUserService,
  loginUserService,
  logoutUserService,
  refreshService,
  checkService,
  changePasswordService,
  forgotPasswordService,
  // resetPasswordService,
  verifyResetPasswordService,
  checkVerifyStatusService,
  checkVerifiedEmailService,
  verifyEmail,
  isEmailExistsService,
};
