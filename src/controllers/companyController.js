// controllers/companies.controller.js
import { object, string } from "joi";
import ApiError from "../exceptions/api-error";
import {
  createCompany as _createCompany,
  deleteCompany as _deleteCompany,
  getCompanyById as _getCompanyById,
  getCompanyByTaxNumber as _getCompanyByTaxNumber,
  getDefaultCompany as _getDefaultCompany,
  searchCompanies as _searchCompanies,
  updateCompany as _updateCompany,
  getUserCompanies,
  syncCacheAfterChanges,
} from "../services/companyService";

// Валидационные схемы
const createCompanySchema = object({
  companyName: string().required().min(2).max(200).trim().messages({
    "string.empty": "Название компании обязательно",
    "string.min": "Название компании должно содержать минимум 2 символа",
    "string.max": "Название компании не должно превышать 200 символов",
  }),

  legalAddress: string().required().min(10).max(300).trim().messages({
    "string.empty": "Юридический адрес обязателен",
    "string.min": "Адрес слишком короткий (минимум 10 символов)",
    "string.max": "Адрес слишком длинный (максимум 300 символов)",
  }),

  companyAddress: string().allow("").max(300).trim().optional(),

  taxNumber: string()
    .required()
    .pattern(/^\d{10}$|^\d{12}$/)
    .messages({
      "string.empty": "ИНН обязателен",
      "string.pattern.base": "ИНН должен содержать 10 или 12 цифр",
    }),

  contactPerson: string().allow("").max(100).trim().optional(),

  phone: string()
    .allow("")
    .pattern(/^[\d\s\-+()]+$/)
    .max(20)
    .trim()
    .optional()
    .messages({
      "string.pattern.base": "Неверный формат телефона",
    }),

  email: string()
    .allow("")
    .email()
    .max(100)
    .trim()
    .lowercase()
    .optional()
    .messages({
      "string.email": "Неверный формат email",
    }),
});

const updateCompanySchema = object({
  companyName: string().min(2).max(200).trim().optional(),

  legalAddress: string().min(10).max(300).trim().optional(),

  companyAddress: string().allow("").max(300).trim().optional(),

  taxNumber: string()
    .pattern(/^\d{10}$|^\d{12}$/)
    .optional()
    .messages({
      "string.pattern.base": "ИНН должен содержать 10 или 12 цифр",
    }),

  contactPerson: string().allow("").max(100).trim().optional(),

  phone: string()
    .allow("")
    .pattern(/^[\d\s\-+()]+$/)
    .max(20)
    .trim()
    .optional()
    .messages({
      "string.pattern.base": "Неверный формат телефона",
    }),

  email: string()
    .allow("")
    .email()
    .max(100)
    .trim()
    .lowercase()
    .optional()
    .messages({
      "string.email": "Неверный формат email",
    }),
}).min(1); // Хотя бы одно поле должно быть обновлено

const searchCompanySchema = object({
  query: string().required().min(1).max(100).trim().messages({
    "string.empty": "Поисковый запрос обязателен",
    "string.min": "Запрос должен содержать минимум 1 символ",
    "string.max": "Запрос не должен превышать 100 символов",
  }),
});

class CompaniesController {
  /**
   * Создание компании
   * POST /api/companies
   */
  async createCompany(req, res, next) {
    try {
      // Валидация входных данных
      const { error, value } = createCompanySchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        throw ApiError.BadRequest("Ошибка валидации данных компании", errors);
      }

      const company = await _createCompany(req.user.id, value);

      res.status(201).json({
        success: true,
        message: "Компания успешно создана",
        company,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение всех компаний пользователя
   * GET /api/companies
   */
  async getCompanies(req, res, next) {
    try {
      const companies = await getUserCompanies(req.user.id);

      res.status(200).json({
        success: true,
        count: companies.length,
        companies,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение компании по ID
   * GET /api/companies/:id
   */
  async getCompanyById(req, res, next) {
    try {
      const { id } = req.params;

      if (!id) {
        throw ApiError.BadRequest("ID компании обязателен");
      }

      const company = await _getCompanyById(req.user.id, id);

      res.status(200).json({
        success: true,
        company,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение компании по ИНН
   * GET /api/companies/tax/:taxNumber
   */
  async getCompanyByTaxNumber(req, res, next) {
    try {
      const { taxNumber } = req.params;

      if (!taxNumber) {
        throw ApiError.BadRequest("ИНН обязателен");
      }

      const company = await _getCompanyByTaxNumber(req.user.id, taxNumber);

      res.status(200).json({
        success: true,
        company,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Обновление компании
   * PUT /api/companies/:id
   */
  async updateCompany(req, res, next) {
    try {
      const { id } = req.params;

      if (!id) {
        throw ApiError.BadRequest("ID компании обязателен");
      }

      // Валидация входных данных
      const { error, value } = updateCompanySchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        throw ApiError.BadRequest("Ошибка валидации данных компании", errors);
      }

      const company = await _updateCompany(req.user.id, id, value);

      res.status(200).json({
        success: true,
        message: "Компания успешно обновлена",
        company,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Удаление компании
   * DELETE /api/companies/:id
   */
  async deleteCompany(req, res, next) {
    try {
      const { id } = req.params;

      if (!id) {
        throw ApiError.BadRequest("ID компании обязателен");
      }

      const result = await _deleteCompany(req.user.id, id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Поиск компаний
   * GET /api/companies/search?query=...
   */
  async searchCompanies(req, res, next) {
    try {
      const { error, value } = searchCompanySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        throw ApiError.BadRequest(
          "Ошибка валидации поискового запроса",
          errors,
        );
      }

      const companies = await _searchCompanies(req.user.id, value.query);

      res.status(200).json({
        success: true,
        count: companies.length,
        companies,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение дефолтной компании
   * GET /api/companies/default
   */
  async getDefaultCompany(req, res, next) {
    try {
      const company = await _getDefaultCompany(req.user.id);

      res.status(200).json({
        success: true,
        company: company || null,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Синхронизация кеша (для административных целей)
   * POST /api/companies/sync-cache
   */
  async syncCache(req, res, next) {
    try {
      // Проверяем права (только для администраторов)
      if (req.user.role !== "admin") {
        throw ApiError.Forbidden("Недостаточно прав");
      }

      const { userId } = req.body;

      if (!userId) {
        throw ApiError.BadRequest("ID пользователя обязателен");
      }

      await syncCacheAfterChanges(userId);

      res.status(200).json({
        success: true,
        message: "Кеш компаний синхронизирован",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CompaniesController();
