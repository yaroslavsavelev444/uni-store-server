const contactsService = require("../services/contactsService");
const ApiError = require("../exceptions/api-error");

const submitContacts = async (req, res, next) => {
  try {
    const { name, email, phone, message, captcha } = req.body;

    if (!name || !email || !phone) {
      throw ApiError.BadRequest("Заполните все обязательные поля");
    }

    if (process.env.NODE_ENV === "production") {
      console.log("Получен токен капчи:", captcha);
      if (!captcha) {
        throw ApiError.BadRequest("Подтвердите, что вы не робот");
      }

      const params = new URLSearchParams();
      params.append("secret", process.env.RECAPTCHA_SECRET_KEY);
      params.append("response", captcha);

      const captchaResponse = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        }
      );
      const captchaData = await captchaResponse.json();
      console.log("Ответ от Google reCAPTCHA:", captchaData);
      if (!captchaData.success) {
        throw ApiError.BadRequest("Ошибка проверки reCAPTCHA");
      }
    }

    const result = await contactsService.submitContacts(
      name,
      email,
      phone,
      message
    );
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  submitContacts,
};
