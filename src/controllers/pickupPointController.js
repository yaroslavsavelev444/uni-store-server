// controllers/pickup-point.controller.js
import ApiError from "../exceptions/api-error";
import {
  createPickupPoint as _createPickupPoint,
  deletePickupPoint as _deletePickupPoint,
  getMainPickupPoint as _getMainPickupPoint,
  setAsMainPickupPoint as _setAsMainPickupPoint,
  togglePickupPointStatus as _togglePickupPointStatus,
  updatePickupPoint as _updatePickupPoint,
  updatePickupPointsOrder as _updatePickupPointsOrder,
  getAllPickupPoints,
  getPickupPointById,
} from "../services/pickupPointService";

class PickupPointController {
  /**
   * Получить все пункты самовывоза
   * GET /api/pickup-points
   */
  async getPickupPoints(req, res, next) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const points = await getAllPickupPoints(includeInactive);
      res.status(200).json(points);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получить главный пункт самовывоза
   * GET /api/pickup-points/main
   */
  async getMainPickupPoint(req, res, next) {
    try {
      const point = await _getMainPickupPoint();
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получить пункт по ID
   * GET /api/pickup-points/:id
   */
  async getPickupPoint(req, res, next) {
    try {
      const { id } = req.params;
      const point = await getPickupPointById(id);
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Создать новый пункт самовывоза
   * POST /api/pickup-points
   */
  async createPickupPoint(req, res, next) {
    try {
      const pointData = req.body;
      const point = await _createPickupPoint(pointData, req.user.id);
      res.status(201).json(point);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Обновить пункт самовывоза
   * PUT /api/pickup-points/:id
   */
  async updatePickupPoint(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const point = await _updatePickupPoint(id, updateData, req.user.id);
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Удалить пункт самовывоза
   * DELETE /api/pickup-points/:id
   */
  async deletePickupPoint(req, res, next) {
    try {
      const { id } = req.params;
      const result = await _deletePickupPoint(id, req.user.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Изменить статус активности
   * PATCH /api/pickup-points/:id/toggle-status
   */
  async togglePickupPointStatus(req, res, next) {
    try {
      const { id } = req.params;
      const point = await _togglePickupPointStatus(id, req.user.id);
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Сделать пункт главным
   * PATCH /api/pickup-points/:id/set-main
   */
  async setAsMainPickupPoint(req, res, next) {
    try {
      const { id } = req.params;
      const point = await _setAsMainPickupPoint(id, req.user.id);
      res.status(200).json(point);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Обновить порядок пунктов
   * PUT /api/pickup-points/order
   */
  async updatePickupPointsOrder(req, res, next) {
    try {
      const { orderedIds } = req.body;

      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        throw ApiError.BadRequest("Некорректный массив ID");
      }

      const result = await _updatePickupPointsOrder(orderedIds, req.user.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new PickupPointController();
