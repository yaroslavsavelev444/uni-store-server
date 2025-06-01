const ApiError = require("../exceptions/api-error");
const constructorService = require("../services/constructorService");

const submitData = async (req, res, next) => {
  const { name, email, phone, captchaToken } = req.body;

  if (!phone || !captchaToken) {
    return next(ApiError.BadRequest("Заполните все обязательные поля и пройдите капчу"));
  }

  try {
    const data = await constructorService.submitData({ name, email, phone, captchaToken });
    res.status(200).json({ message: "Данные успешно отправлены", data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitData,
};
