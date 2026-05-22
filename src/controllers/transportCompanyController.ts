// controllers/transportCompanyController.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import TransportCompanyService from "../services/transportCompanyService.js";
import type {
  CreateReq,
  DeleteReq,
  GetActiveReq,
  GetAllReq,
  UpdateReq,
} from "../types/controllers/transportCompany-controller.js";

class TransportCompanyController {
  /**
   * Для пользователя: получить только активные компании (публичный маршрут)
   */
  getActive = async (
    req: GetActiveReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const companies = await TransportCompanyService.getActive();
      res.json(companies);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Для админа: получить все компании
   */
  getAll = async (
    req: GetAllReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const companies = await TransportCompanyService.getAll();
      res.json(companies);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Создать компанию (только админ)
   */
  create = async (
    req: CreateReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const company = await TransportCompanyService.create(req.body);
      res.status(201).json(company);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновить компанию (только админ)
   */
  update = async (
    req: UpdateReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw ApiError.BadRequest("Не указан идентификатор компании");
      }
      const company = await TransportCompanyService.update(id, req.body);
      res.json(company);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удалить компанию (только админ)
   */
  delete = async (
    req: DeleteReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw ApiError.BadRequest("Не указан идентификатор компании");
      }
      const result = await TransportCompanyService.delete(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default new TransportCompanyController();
