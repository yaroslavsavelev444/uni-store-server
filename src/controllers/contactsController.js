const contactsService = require("../services/contactsService");
const ApiError = require("../exceptions/api-error");

const submitContacts = async (req, res, next) => {
  try {
    const { name, email, message } = req.body;
    const result = await contactsService.submitContacts(name, email, message);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  submitContacts,
};
