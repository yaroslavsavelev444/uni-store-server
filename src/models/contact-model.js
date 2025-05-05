const { Schema, model } = require('mongoose');

const contactSchema = new Schema({
  name: { type: String, trim: true }, // если в форме есть имя
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Неверный формат email']
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^[\d\-\+\s\(\)]+$/, 'Неверный формат телефона']
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000 // чтобы ограничить слишком длинные сообщения
  }
}, {
  timestamps: true
});

module.exports = model('Contact', contactSchema);