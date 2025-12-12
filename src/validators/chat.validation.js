const Joi = require('joi');

const getChatsSchema = Joi.object({
  params: Joi.object({
    type: Joi.string().valid("active", "archived").required(),
  }),
});
const getMessagesSchema = Joi.object({
  userId: Joi.string().required(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

const sendMessageSchema = Joi.object({
  text: Joi.string().when('image', {
    is: Joi.exist(),
    then: Joi.string().allow('').optional(),
    otherwise: Joi.string().required()
  }),
  image: Joi.string().uri(),
});

const toggleArchiveSchema = Joi.object({
  chatId: Joi.string().required(),
});

const markAsReadSchema = Joi.object({
  messageIds: Joi.array().items(Joi.string()).min(1).required(),
  receiverId: Joi.string().required(),
});

module.exports = {
  getChatsSchema,
  getMessagesSchema,
  sendMessageSchema,
  toggleArchiveSchema,
  markAsReadSchema
};