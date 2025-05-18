const ApiError = require('../exceptions/api-error');
const authService = require('../services/authService');
const {validationResult} = require('express-validator');

const isEmailExists = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw ApiError.BadRequest("Отсутствует email");
    }
    const status = await authService.isEmailExistsService(email);
    return res.json(status);
  } catch (e) {
    next(e);
}
}

const registerUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return next(ApiError.BadRequest('Ошибка при валидации', errors.array()));
    } 
    const { email, phone, password, name, surname, role } = req.body;

    const userData = await authService.registerUserService(email, phone,  password, name, surname, role);
    return res.json(userData);
  } catch (e) {
    next(e);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.BadRequest('Ошибка при валидации', errors.array()));
    }

    const { email, password } = req.body;
    
    if (!email || !password) {
      throw ApiError.BadRequest("Отсутствует email или пароль");
    }
    const userData = await authService.loginUserService(email, password);

      res.cookie('refreshToken', userData.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false, // true только на HTTPS
  sameSite: 'Strict', // или 'None' с secure: true, если фронт и бэк на разных доменах
        path: '/',
      });

    return res.json(userData);

  }  catch (e) {
    next(e);
}
};

const logoutUser = async (req, res, next) => {
  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    const refreshToken = req.body.refreshToken

    if (!refreshToken) {
      throw ApiError.UnauthorizedError();
    };

    const token = await authService.logoutUserService(refreshToken, accessToken);
    res.clearCookie('refreshToken');
    return res.json(token);
  }  catch (e) {
    next(e);
}
};

//Сюда обращается перехватчик
const refresh = async (req, res, next) => {
  try {
    const {refreshToken} = req.cookies;

    if (!refreshToken) {
      return next(ApiError.UnauthorizedError());
    } 

    const userData = await authService.refreshService(refreshToken );
      res.cookie('refreshToken', userData.refreshToken, {maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true})
      return res.json(userData);

  } catch (e) {
    next(e);
  }
};

//Тут мы чекаем токены
const check = async (req, res, next) => {
  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    const refreshToken = req.body.refreshToken;

    if (!accessToken || !refreshToken) {
      return next(ApiError.UnauthorizedError());
    }
    const userData = await authService.checkService(accessToken, refreshToken );
    console.log("checkuserData", userData);
    return res.json(userData);
  } catch (e) {
    next(e);
  }
};

const checkVerifiedEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw ApiError.BadRequest("Отсутствует email");
    }
    const status = await authService.checkVerifiedEmailService(email);
      res.cookie('refreshToken', status.refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false, // ❗ В разработке (HTTP) должен быть false
        sameSite: 'Lax', // или 'Strict', зависит от ситуации
        path: '/',
      });
      return res.json(status);
  } catch (e) {
    next(e);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).render("verify-result", {
        title: "Ошибка",
        message: "Отсутствует токен активации",
        success: false,
      });
    }

    await authService.verifyEmail(token);

    return res.render("verify-result", {
      title: "Почта подтверждена",
      message: "Вы успешно подтвердили свою почту.",
      success: true,
    });

  } catch (e) {
    console.error("Ошибка подтверждения email:", e.message);

    return res.status(400).render("verify-result", {
      title: "Ошибка активации",
      message: e.message || "Произошла ошибка при подтверждении почты.",
      success: false,
    });
  }
};


// ПАРОЛИ
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!userId || !oldPassword || !newPassword) {
      return next(ApiError.UnauthorizedError("Токены не предоставлены"));
    }

    const userData = await authService.changePasswordService(userId, oldPassword, newPassword);
    
    return res.json(userData); 
  } catch (e) {
    next(e); 
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      throw ApiError.BadRequest("Некорректный email");
    }
    
    const status = await authService.forgotPasswordService(email);
    return res.json({ message: 'Письмо отправлено, проверьте почту', status });
  } catch (e) {
    next(e);
  }
};

const verifyResetPassword = async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).render("verify-result", {
        title: "Ошибка",
        message: "Отсутствует токен сброса пароля",
        success: false,
        frontendUrl: process.env.FRONTEND_URL || "/"
      });
    }

    await authService.verifyResetPasswordService(token);

    return res.render("verify-result", {
      title: "Успешно",
      message: "Вы успешно подтвердили сброс пароля.",
      success: true,
      frontendUrl: process.env.FRONTEND_URL || "/"
    });

  } catch (e) {
    return res.status(400).render("verify-result", {
      title: "Ошибка",
      message: e.message || "Что-то пошло не так",
      success: false,
      frontendUrl: process.env.FRONTEND_URL || "/"
    });
  }
};

const checkVerifyStatus = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw ApiError.BadRequest("Отсутствует email");
    }
    const status = await authService.checkVerifyStatusService(email);
    console.log("status", status);
    return res.json(status);
  } catch (e) {
    next(e);
  }
};

const resetForgottenPassword = async (req, res, next) => {
  try {
    const { password, email } = req.body;

    if ( !email ) {
      throw ApiError.BadRequest("Отсутствует email");
    }
    if (!password || password.length < 8) {
      throw ApiError.BadRequest("Пароль должен содержать минимум 8 символов");
    }

    await authService.resetPasswordService(password, email);
    return res.json({ message: 'Пароль успешно изменён' , status: 200});
  } catch (e) {
    next(e);
  }
};


module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  refresh,
  check,
  changePassword, 
  forgotPassword,
  resetForgottenPassword,
  verifyResetPassword,
  checkVerifyStatus,
  checkVerifiedEmail,
  verifyEmail,
  isEmailExists
};