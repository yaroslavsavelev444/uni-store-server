const {TransportCompanyModel} = require("../models/index.models");

class TransportCompanyService {
  /**
   * Получить все активные транспортные компании (для пользователя)
   */
  async getActive() {
    return await TransportCompanyModel.find({ isActive: true })
      .sort({ name: 1 })
      .lean();
  }

  /**
   * Получить все компании, включая неактивные (для админа)
   */
  async getAll() {
    return await TransportCompanyModel.find().sort({ name: 1 }).lean();
  }

  /**
   * Создать новую транспортную компанию
   */
  async create(data) {
    const company = new TransportCompanyModel(data);
    await company.save();
    return company.toObject();
  }

  /**
   * Обновить транспортную компанию
   */
  async update(id, data) {
    const company = await TransportCompanyModel.findById(id);
    if (!company) {
      throw new Error("Транспортная компания не найдена");
    }

    Object.keys(data).forEach((key) => {
      if (key !== "_id" && key !== "__v") {
        company[key] = data[key];
      }
    });

    await company.save();
    return company.toObject();
  }

  /**
   * Удалить транспортную компанию
   */
  async delete(id) {
    const result = await TransportCompanyModel.findByIdAndDelete(id);
    if (!result) {
      throw new Error("Транспортная компания не найдена");
    }
    return { success: true };
  }
}

module.exports = new TransportCompanyService();