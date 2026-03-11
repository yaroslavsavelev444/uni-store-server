import ApiError from "../exceptions/api-error";
import {
  markClicked as _markClicked,
  markDismissed as _markDismissed,
  markViewed as _markViewed,
} from "../services/bannerStatsService";

class BannerStatsController {
  async markViewed(req, res, next) {
    try {
      const { id: bannerId } = req.params;
      const userId = req.user.id;

      if (!bannerId) throw ApiError.BadRequest("Не передан ID баннера");

      const result = await _markViewed(userId, bannerId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async markClicked(req, res, next) {
    try {
      const { id: bannerId } = req.params;
      const userId = req.user.id;

      if (!bannerId) throw ApiError.BadRequest("Не передан ID баннера");

      const result = await _markClicked(userId, bannerId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async markDismissed(req, res, next) {
    try {
      const { id: bannerId } = req.params;
      const userId = req.user.id;

      if (!bannerId) throw ApiError.BadRequest("Не передан ID баннера");

      const result = await _markDismissed(userId, bannerId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new BannerStatsController();
