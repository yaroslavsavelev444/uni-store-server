const { default: axios } = require("axios");
const ApiError = require("../exceptions/api-error");
const { ContactConstructorModel } = require("../models/indexModels");
const { sendEmailNotification } = require("../queues/taskQueues");

const submitData = async ({ name, email, phone, captchaToken }) => {
  // Проверка CAPTCHA
  const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
  const response = await axios.post(verifyUrl, null, {
    params: {
      secret: RECAPTCHA_SECRET_KEY,
      response: captchaToken,
    },
  });

  if (!response.data.success) {
    throw ApiError.BadRequest("Ошибка проверки reCAPTCHA");
  }

  const contact = new ContactConstructorModel({ name, email, phone });
  await contact.save();

  await sendEmailNotification(
    process.env.SMTP_USER,
    "newContact",
    { data: { name, email, phone } },
    true
  );

  return { name, email, phone };
};

module.exports = {
  submitData,
};
