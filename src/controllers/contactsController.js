const contactsService = require("../services/contactsService");
const ApiError = require("../exceptions/api-error");

const submitContacts = async (req, res, next) => {
  try {
    const { user, email, phone, msg, captcha } = req.body;

    if (!user || !email || !phone || !msg) {
      throw ApiError.BadRequest("Заполните все обязательные поля");
    }

    // Проверка капчи (ТОЛЬКО в проде)
    if (process.env.NODE_ENV === "production") {
      if (!captcha) {
        throw ApiError.BadRequest("Подтвердите, что вы не робот");
      }

      const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captcha}`;
      const captchaResponse = await fetch(verifyUrl, { method: "POST" });
      const captchaData = await captchaResponse.json();

      if (!captchaData.success) {
        throw ApiError.BadRequest("Ошибка проверки reCAPTCHA");
      }
    }

    const result = await contactsService.submitContacts(user, email, phone, msg);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  submitContacts,
};
