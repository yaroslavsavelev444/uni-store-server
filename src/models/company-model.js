const { Schema, model } = require('mongoose');

const companySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  companyName: { type: String, required: true }, // Название организации
  legalAddress: { type: String, required: true }, // Юридический адрес
  inn: { type: String, required: true }, // ИНН
  kpp: { type: String }, // КПП (для юр. лиц)
  ogrn: { type: String, required: true }, // ОГРН
  checkingAccount: { type: String }, // Расчетный счёт
  bankName: { type: String, required: true }, // Название банка
  bik: { type: String, required: true }, // БИК
  correspondentAccount: { type: String, required: true }, // Корр. счёт
  email: { type: String }, // Email
}, {
  timestamps: true
});

module.exports = model('Company', companySchema);