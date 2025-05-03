const ApiError = require("../exceptions/api-error");
const { ContactModel } = require("../models/indexModels");
const { sendEmailNotification } = require("../queues/taskQueues");

const submitContacts = async (name, email, message) => {
  try {
    const newContact = new ContactModel({ name, email, message });
    await newContact.save();

    await sendEmailNotification(process.env.ADMIN_EMAIL, "newContact", {
      name,
      email,
      message,
      created: Date.now(),
    });
  } catch (error) {
    console.log(error);
    throw ApiError.InternalServerError(error);
  }
};

const deleteContact = async (contactId) => {
  try {
    await ContactModel.findByIdAndDelete(contactId);
  } catch (error) {
    console.log(error);
    throw ApiError.InternalServerError(error);
  }
};

module.exports = { submitContacts, deleteContact };
