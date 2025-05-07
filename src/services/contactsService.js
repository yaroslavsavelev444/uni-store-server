const ApiError = require("../exceptions/api-error");
const { ContactModel } = require("../models/indexModels");
const { sendEmailNotification } = require("../queues/taskQueues");
const { formattedDate } = require("../utils/formats");

const submitContacts = async (name, email, phone, message) => {
  try {
    const newContact = new ContactModel({ name, email, phone, message });
    await newContact.save();

    sendEmailNotification(process.env.SMTP_USER, "newContact", {
      name: newContact.name || "Не указано",
      email: newContact.email || "Не указано",
      phone: newContact.phone || "Не указано",
      msg: newContact.message || "Не указано",
    });

    return newContact;
  } catch (error) {
    console.error("Ошибка сохранения контакта:", error);
    throw ApiError.InternalServerError(error.message);
  }
};

const getContacts = async () => {
  try {
    const contacts = await ContactModel.find();
    return contacts;
  } catch (error) {
    console.error("Ошибка получения контактов:", error);
    throw ApiError.InternalServerError(error.message);
  }
};

const updateContactStatus = async (contactId, status) => {
  try {
    const contact = await ContactModel.findById(contactId);
    if (!contact) {
      throw ApiError.NotFound("Контакт не найден");
    }
    if(status === 'delete'){
        await ContactModel.findByIdAndDelete(contactId);
        return contact;
    }
    contact.status = status;
    await contact.save();
    return contact;
  } catch (error) {
    console.error("Ошибка обновления статуса контакта:", error);
    throw ApiError.InternalServerError(error.message);
  }
};
module.exports = { submitContacts, getContacts, updateContactStatus };
