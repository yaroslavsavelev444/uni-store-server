const { Schema, model } = require("mongoose");


const socialSchema = new Schema({
  icon: String, // путь к файлу
  url: String,
});

const OrgShema = new Schema(
  {
    logo: { type: String, required: true },
    companyName: { type: String, required: true },
    workTime: { type: String, required: true },  // Время работы, если это строки, то лучше использовать String
    address: { type: String, required: true },  // Должно быть строкой, так как это адрес
    phone: { type: String, required: true },  // Телефон тоже лучше сделать строкой
    email: { type: String, required: true },  // Электронная почта
    description: { type: String, required: false },  // Описание компании (по желанию)
    files: [
      {
        path: { type: String, required: true },
        displayName: { type: String, required: false },
      }
    ],
    socialLinks: [socialSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = model("Org", OrgShema);