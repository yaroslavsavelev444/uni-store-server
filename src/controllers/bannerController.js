import ApiError from "../exceptions/api-error";
import {
  changeStatus as _changeStatus,
  createBanner,
  deleteBanner,
  getBannerById,
  getBannerForUser,
  listBanners,
  updateBanner,
} from "../services/bannerService";

class BannerController {
  async create(req, res, next) {
    try {
      const bannerData = req.body;
      const userId = req.user.id;

      console.log("Получены данные для создания баннера:", {
        bannerData,
        media: bannerData.media,
      });

      // Обрабатываем медиа-файлы
      let uploadedMedia = [];
      if (bannerData.media && Array.isArray(bannerData.media)) {
        uploadedMedia = bannerData.media;
      }

      const banner = await createBanner({
        bannerData,
        uploadedMedia, // Переименовано с uploadedImage на uploadedMedia
        userId,
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

      console.log("Получены данные для обновления баннера:", {
        id,
        bannerData,
        media: bannerData.media,
      });

      // Проверка доступа к конкретному баннеру
      const existingBanner = await getBannerById(id);
      if (!existingBanner) {
        throw ApiError.NotFoundError("Баннер не найден");
      }

      // Можно добавить дополнительную проверку, например, что пользователь является создателем или администратором
      if (
        existingBanner.createdBy.toString() !== userId &&
        !req.user.roles.includes("admin")
      ) {
        throw ApiError.ForbiddenError(
          "Нет доступа для редактирования этого баннера",
        );
      }

      // Обрабатываем медиа-файлы
      let uploadedMedia = [];
      if (bannerData.media && Array.isArray(bannerData.media)) {
        uploadedMedia = bannerData.media;
      }

      // Получаем удаляемые URL из запроса
      let deletedUrls = [];
      if (bannerData.deletedUrls) {
        try {
          deletedUrls = JSON.parse(bannerData.deletedUrls);
        } catch {
          deletedUrls = bannerData.deletedUrls;
          if (!Array.isArray(deletedUrls)) {
            deletedUrls = [deletedUrls].filter(Boolean);
          }
        }
      }

      const banner = await updateBanner({
        id,
        bannerData,
        uploadedMedia, // Переименовано с uploadedImage на uploadedMedia
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
      const banners = await listBanners(req.query);
      res.json(banners);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const banner = await getBannerById(req.params.id);
      if (!banner) throw ApiError.NotFoundError("Баннер не найден");
      res.json(banner);
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const banner = await getBannerById(req.params.id);
      if (!banner) {
        throw ApiError.NotFoundError("Баннер не найден");
      }

      await deleteBanner(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  async changeStatus(req, res, next) {
    try {
      const updated = await _changeStatus(req.params.id, req.body.status);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  async getForUser(req, res, next) {
    try {
      const banner = await getBannerForUser(req.user);
      console.log("banner", banner);

      res.json(banner ? [banner] : []);
    } catch (err) {
      next(err);
    }
  }
}

export default new BannerController();
