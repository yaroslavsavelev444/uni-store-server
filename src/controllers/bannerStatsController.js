import ApiError from "../exceptions/api-error.js";
import bannerStatsService from "../services/bannerStatsService.js";

const {
  markClicked: _markClicked,
  markDismissed: _markDismissed,
  markViewed: _markViewed,
} = bannerStatsService;

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
