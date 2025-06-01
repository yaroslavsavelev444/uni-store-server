const { Schema, model } = require("mongoose");

const contactConstructorSchema = new Schema({
  name: { type: String, trim: true },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "Неверный формат email"]
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^[\d\-\+\s\(\)]+$/, "Неверный формат телефона"]
  }
}, {
  timestamps: true
});

module.exports = model("ContactConstructor", contactConstructorSchema);