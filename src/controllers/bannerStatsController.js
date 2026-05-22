const ApiError = require("../exceptions/api-error");
const bannerStatsService = require("../services/bannerStatsService");

class BannerStatsController {
  async markViewed(req, res, next) {
    try {
      const { id: bannerId } = req.params;
      const userId = req.user.id;
      
      if (!bannerId) throw ApiError.BadRequest("Не передан ID баннера");

      const result = await bannerStatsService.markViewed(userId, bannerId);
      res.status(200).json({ 
        success: true, 
        data: result 
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

      const result = await bannerStatsService.markClicked(userId, bannerId);
      res.status(200).json({ 
        success: true, 
        data: result 
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

      const result = await bannerStatsService.markDismissed(userId, bannerId);
      res.status(200).json({ 
        success: true, 
        data: result 
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new BannerStatsController();