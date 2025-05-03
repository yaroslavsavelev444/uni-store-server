const { Schema, model } = require('mongoose');

const companySchema = new Schema({
  companyName: { type: String, required: true }, // Название организации
  legalAddress: { type: String, required: true }, // Юридический адрес
  inn: { type: String, required: true }, // ИНН
  kpp: { type: String }, // КПП (для юр. лиц)
  ogrn: { type: String, required: true }, // ОГРН
  checkingAccount: { type: String, required: true }, // Расчетный счёт
  bankName: { type: String, required: true }, // Название банка
  bik: { type: String, required: true }, // БИК
  correspondentAccount: { type: String, required: true }, // Корр. счёт
  directorFullName: { type: String, required: true }, // ФИО директора
  phone: { type: String }, // Телефон
  email: { type: String, required: true }, // Email
}, {
  timestamps: true
});

module.exports = model('Company', companySchema);