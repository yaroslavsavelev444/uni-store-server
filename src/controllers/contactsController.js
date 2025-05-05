const contactsService = require("../services/contactsService");
const ApiError = require("../exceptions/api-error");

const submitContacts = async (req, res, next) => {
  try {
    const { user, email, phone, msg } = req.body;
    console.log(user, email, phone, msg);
    if(!user || !email || !phone || !msg) {
      throw ApiError.BadRequest("Заполните все обязательные поля");
    }
    // Переименовываем поля, чтобы совпадали с моделью
    const result = await contactsService.submitContacts(user, email, phone, msg);
    
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  submitContacts,
};
