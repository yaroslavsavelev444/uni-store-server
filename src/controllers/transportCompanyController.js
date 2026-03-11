import {
  create as _create,
  delete as _delete,
  getActive as _getActive,
  getAll as _getAll,
  update as _update,
} from "../services/transportCompanyService";

class TransportCompanyController {
  // Для пользователя: получить только активные компании
  async getActive(req, res, next) {
    try {
      const companies = await _getActive();
      res.json(companies);
    } catch (error) {
      next(error);
    }
  }

  // Для админа: получить все компании
  async getAll(req, res, next) {
    try {
      const companies = await _getAll();
      res.json(companies);
    } catch (error) {
      next(error);
    }
  }

  // Создать компанию
  async create(req, res, next) {
    try {
      const company = await _create(req.body);
      res.status(201).json(company);
    } catch (error) {
      next(error);
    }
  }

  // Обновить компанию
  async update(req, res, next) {
    try {
      const company = await _update(req.params.id, req.body);
      res.json(company);
    } catch (error) {
      next(error);
    }
  }

  // Удалить компанию
  async delete(req, res, next) {
    try {
      const result = await _delete(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new TransportCompanyController();
