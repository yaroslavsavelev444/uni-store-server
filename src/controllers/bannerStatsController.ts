// banner-stats.controller.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import bannerStatsService from "../services/bannerStatsService.js";
import type {
  MarkClickedReq,
  MarkDismissedReq,
  MarkViewedReq,
  StatsResponse,
  StatsServiceResult,
} from "../types/controllers/banner-stats-controller.js";

/**
 * Контроллер для сбора статистики по баннерам (просмотры, клики, отклонения).
 * Все методы требуют авторизации (req.user гарантирован).
 */
class BannerStatsController {
  /**
   * Зафиксировать просмотр баннера.
   */
  markViewed = async (
    req: MarkViewedReq,
    res: Response<StatsResponse<StatsServiceResult>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: bannerId } = req.params;
      const userId = req.user.id; // user присутствует в AuthRequest

      if (!bannerId) {
        throw ApiError.BadRequest("Не передан ID баннера");
      }

      const result = await bannerStatsService.markViewed(userId, bannerId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Зафиксировать клик по баннеру.
   */
  markClicked = async (
    req: MarkClickedReq,
    res: Response<StatsResponse<StatsServiceResult>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: bannerId } = req.params;
      const userId = req.user.id;

      if (!bannerId) {
        throw ApiError.BadRequest("Не передан ID баннера");
      }

      const result = await bannerStatsService.markClicked(userId, bannerId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Зафиксировать отклонение (dismiss) баннера.
   */
  markDismissed = async (
    req: MarkDismissedReq,
    res: Response<StatsResponse<StatsServiceResult>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: bannerId } = req.params;
      const userId = req.user.id;

      if (!bannerId) {
        throw ApiError.BadRequest("Не передан ID баннера");
      }

      const result = await bannerStatsService.markDismissed(userId, bannerId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export default new BannerStatsController();
