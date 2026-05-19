// controllers/companies.controller.ts
import type { NextFunction, Response } from "express";
import joi from "joi";
import ApiError from "../exceptions/api-error.js";
import CompanyService, {
  type SearchCompanyResult,
} from "../services/companyService.js";
import type { ICompany } from "../types/company.types.js";
import type {
  CompanyResponse,
  CreateCompanyReq,
  DeleteCompanyReq,
  GetCompaniesReq,
  GetCompanyByIdReq,
  GetCompanyByTaxNumberReq,
  GetDefaultCompanyReq,
  SearchCompaniesReq,
  SyncCacheReq,
  UpdateCompanyReq,
} from "../types/controllers/companies-controller.js";

const { object, string } = joi;

// Валидационные схемы (оставлены без изменений, но типизированы)
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
}).min(1);

const searchCompanySchema = object({
  query: string().required().min(1).max(100).trim().messages({
    "string.empty": "Поисковый запрос обязателен",
    "string.min": "Запрос должен содержать минимум 1 символ",
    "string.max": "Запрос не должен превышать 100 символов",
  }),
});

/**
 * Контроллер для управления компаниями пользователя.
 * Все методы, кроме syncCache, требуют авторизации (req.user.id).
 */
class CompaniesController {
  /**
   * Создание компании.
   * POST /api/companies
   */
  createCompany = async (
    req: CreateCompanyReq,
    res: Response<CompanyResponse<ICompany>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
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

      const company = await CompanyService.createCompany(req.user.id, value);
      res.status(201).json({
        success: true,
        message: "Компания успешно создана",
        company,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение всех компаний пользователя.
   * GET /api/companies
   */
  getCompanies = async (
    req: GetCompaniesReq,
    res: Response<CompanyResponse<ICompany>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const companies = await CompanyService.getUserCompanies(req.user.id);
      res.status(200).json({
        success: true,
        count: companies.length,
        companies,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение компании по ID.
   * GET /api/companies/:id
   */
  getCompanyById = async (
    req: GetCompanyByIdReq,
    res: Response<CompanyResponse<ICompany>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw ApiError.BadRequest("ID компании обязателен");
      }
      const company = await CompanyService.getCompanyById(req.user.id, id);
      res.status(200).json({
        success: true,
        company,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение компании по ИНН.
   * GET /api/companies/tax/:taxNumber
   */
  getCompanyByTaxNumber = async (
    req: GetCompanyByTaxNumberReq,
    res: Response<CompanyResponse<ICompany>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { taxNumber } = req.params;
      if (!taxNumber) {
        throw ApiError.BadRequest("ИНН обязателен");
      }
      const company = await CompanyService.getCompanyByTaxNumber(
        req.user.id,
        taxNumber,
      );
      res.status(200).json({
        success: true,
        company,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновление компании.
   * PUT /api/companies/:id
   */
  updateCompany = async (
    req: UpdateCompanyReq,
    res: Response<CompanyResponse<ICompany>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw ApiError.BadRequest("ID компании обязателен");
      }

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

      const company = await CompanyService.updateCompany(
        req.user.id,
        id,
        value,
      );
      res.status(200).json({
        success: true,
        message: "Компания успешно обновлена",
        company,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удаление компании.
   * DELETE /api/companies/:id
   */
  deleteCompany = async (
    req: DeleteCompanyReq,
    res: Response<CompanyResponse<{ success: boolean; message: string }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw ApiError.BadRequest("ID компании обязателен");
      }
      const result = await CompanyService.deleteCompany(req.user.id, id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Поиск компаний по названию или ИНН.
   * GET /api/companies/search?query=...
   */
  searchCompanies = async (
    req: SearchCompaniesReq,
    res: Response<CompanyResponse<SearchCompanyResult>>,
    next: NextFunction,
  ): Promise<void> => {
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

      const companies = await CompanyService.searchCompanies(
        req.user.id,
        value.query,
      );
      res.status(200).json({
        success: true,
        count: companies.length,
        companies,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение дефолтной компании (последняя использованная или первая созданная).
   * GET /api/companies/default
   */
  getDefaultCompany = async (
    req: GetDefaultCompanyReq,
    res: Response<CompanyResponse<ICompany | null>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const company = await CompanyService.getDefaultCompany(req.user.id);
      res.status(200).json({
        success: true,
        company: company || null,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Синхронизация кеша компаний (только для администраторов).
   * POST /api/companies/sync-cache
   */
  syncCache = async (
    req: SyncCacheReq,
    res: Response<CompanyResponse<{ message: string }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Проверка прав: только администраторы (role === 'admin')
      if (req.user.role !== "admin") {
        throw ApiError.ForbiddenError("Недостаточно прав");
      }

      const { userId } = req.body;
      if (!userId) {
        throw ApiError.BadRequest("ID пользователя обязателен");
      }

      await CompanyService.syncCacheAfterChanges(userId);
      res.status(200).json({
        success: true,
        message: "Кеш компаний синхронизирован",
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new CompaniesController();
