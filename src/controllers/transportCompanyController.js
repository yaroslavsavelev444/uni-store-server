const TransportCompanyService = require("../services/transportCompanyService");

class TransportCompanyController {
  // Для пользователя: получить только активные компании
  async getActive(req, res, next) {
    try {
      const companies = await TransportCompanyService.getActive();
      res.json(companies);
    } catch (error) {
      next(error);
    }
  }

  // Для админа: получить все компании
  async getAll(req, res, next) {
    try {
      const companies = await TransportCompanyService.getAll();
      res.json(companies);
    } catch (error) {
      next(error);
    }
  }

  // Создать компанию
  async create(req, res, next) {
    try {
      const company = await TransportCompanyService.create(req.body);
      res.status(201).json(company);
    } catch (error) {
      next(error);
    }
  }

  // Обновить компанию
  async update(req, res, next) {
    try {
      const company = await TransportCompanyService.update(
        req.params.id,
        req.body
      );
      res.json(company);
    } catch (error) {
      next(error);
    }
  }

  // Удалить компанию
  async delete(req, res, next) {
    try {
      const result = await TransportCompanyService.delete(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TransportCompanyController();