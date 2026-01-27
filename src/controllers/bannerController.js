const bannerService = require("../services/bannerService");
const ApiError = require("../exceptions/api-error");

class BannerController {
  async create(req, res, next) {
    try {
      const bannerData = req.body;
      const uploadedImage = bannerData.imageUrl || [];

      console.log('bannerData', bannerData);
      
      const banner = await bannerService.createBanner({
        bannerData,
        uploadedImage,
        userId: req.user.id,
      });

      res.status(201).json(banner);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const bannerData = req.body;
      const userId = req.user.id;

      // Проверка доступа к конкретному баннеру
      const existingBanner = await bannerService.getBannerById(id);
      if (!existingBanner) {
        throw ApiError.NotFoundError("Баннер не найден");
      }
      // Можно добавить дополнительную проверку, например, что пользователь является создателем или администратором
      if (existingBanner.createdBy.toString() !== userId && !req.user.roles.includes('admin')) {
        throw ApiError.ForbiddenError("Нет доступа для редактирования этого баннера");
      }

      const uploadedImage = bannerData.imageUrl || [];

      let deletedUrls = [];
      if (bannerData.deletedUrls) {
        try {
          deletedUrls = JSON.parse(bannerData.deletedUrls);
        } catch {
          deletedUrls = [];
        }
      }

      const banner = await bannerService.updateBanner({
        id,
        bannerData,
        uploadedImage,
        deletedUrls,
        userId,
      });

      res.json(banner);
    } catch (err) {
      next(err);
    }
  }

  async getAll(req, res, next) {
    try {
      const banners = await bannerService.listBanners(req.query);
      res.json(banners);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const banner = await bannerService.getBannerById(req.params.id);
      if (!banner) throw ApiError.NotFoundError("Баннер не найден");
      res.json(banner);
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const banner = await bannerService.getBannerById(req.params.id);
      if (!banner) {
        throw ApiError.NotFoundError("Баннер не найден");
      }
      
      await bannerService.deleteBanner(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  async changeStatus(req, res, next) {
    try {
      const updated = await bannerService.changeStatus(
        req.params.id,
        req.body.status
      );
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  async getForUser(req, res, next) {
    try {
      const banner = await bannerService.getBannerForUser(req.user);
      res.json(banner ? [banner] : []);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new BannerController();