// controllers/pickupPointController.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import PickupPointService from "../services/pickupPointService.js";
import type {
  CreatePickupPointReq,
  CreatePickupPointResponse,
  DeletePickupPointReq,
  DeletePickupPointResponse,
  GetMainPickupPointReq,
  GetPickupPointReq,
  GetPickupPointResponse,
  GetPickupPointsReq,
  GetPickupPointsResponse,
  SetMainReq,
  SetMainResponse,
  ToggleStatusReq,
  ToggleStatusResponse,
  UpdateOrderReq,
  UpdateOrderResponse,
  UpdatePickupPointReq,
  UpdatePickupPointResponse,
} from "../types/controllers/pickup-point-controller.js";

class PickupPointController {
  /**
   * Получить все пункты самовывоза
   * GET /api/pickup-points
   */
  getPickupPoints = async (
    req: GetPickupPointsReq,
    res: Response<GetPickupPointsResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const points =
        await PickupPointService.getAllPickupPoints(includeInactive);
      res.status(200).json(points);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить главный пункт самовывоза
   * GET /api/pickup-points/main
   */
  getMainPickupPoint = async (
    _req: GetMainPickupPointReq,
    res: Response<GetPickupPointResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const point = await PickupPointService.getMainPickupPoint();
      res.status(200).json(point || undefined);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить пункт по ID
   * GET /api/pickup-points/:id
   */
  getPickupPoint = async (
    req: GetPickupPointReq,
    res: Response<GetPickupPointResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const point = await PickupPointService.getPickupPointById(id);
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Создать новый пункт самовывоза
   * POST /api/pickup-points (admin)
   */
  createPickupPoint = async (
    req: CreatePickupPointReq,
    res: Response<CreatePickupPointResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const pointData = req.body;
      const point = await PickupPointService.createPickupPoint(
        pointData,
        req.user.id,
      );
      res.status(201).json(point);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновить пункт самовывоза
   * PUT /api/pickup-points/:id (admin)
   */
  updatePickupPoint = async (
    req: UpdatePickupPointReq,
    res: Response<UpdatePickupPointResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Приводим данные к ожидаемому сервисом типу (Partial<PickupPointCreateData>)
      // Проблема: в сервисе address требует street и city, но при обновлении они опциональны.
      // Временно приводим через as any, либо можно расширить тип в сервисе.
      const point = await PickupPointService.updatePickupPoint(
        id,
        updateData as any,
        req.user.id,
      );
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удалить пункт самовывоза
   * DELETE /api/pickup-points/:id (admin)
   */
  deletePickupPoint = async (
    req: DeletePickupPointReq,
    res: Response<DeletePickupPointResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await PickupPointService.deletePickupPoint(
        id,
        req.user.id,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Изменить статус активности
   * PATCH /api/pickup-points/:id/toggle-status (admin)
   */
  togglePickupPointStatus = async (
    req: ToggleStatusReq,
    res: Response<ToggleStatusResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const point = await PickupPointService.togglePickupPointStatus(
        id,
        req.user.id,
      );
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Сделать пункт главным
   * PATCH /api/pickup-points/:id/set-main (admin)
   */
  setAsMainPickupPoint = async (
    req: SetMainReq,
    res: Response<SetMainResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const point = await PickupPointService.setAsMainPickupPoint(
        id,
        req.user.id,
      );
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновить порядок пунктов
   * PUT /api/pickup-points/order (admin)
   */
  updatePickupPointsOrder = async (
    req: UpdateOrderReq,
    res: Response<UpdateOrderResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        throw ApiError.BadRequest("Некорректный массив ID");
      }
      const result = await PickupPointService.updatePickupPointsOrder(
        orderedIds,
        req.user.id,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default new PickupPointController();
