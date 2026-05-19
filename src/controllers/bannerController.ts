// banner.controller.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import bannerService from "../services/bannerService.js";
import type { BannerDocument } from "../types/banner.types.js";
import type {
  ChangeStatusReq,
  CommonResponse,
  CreateReq,
  GetAllReq,
  GetByIdReq,
  GetForUserReq,
  RemoveReq,
  UpdateReq,
} from "../types/controllers/banner-controller.js";

/**
 * Контроллер для управления баннерами.
 * Все методы используют единообразный формат ответа { success, data }.
 */
class BannerController {
  /**
   * Создание нового баннера (требуется авторизация).
   */
  create = async (
    req: CreateReq,
    res: Response<CommonResponse<BannerDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const bannerData = req.body;
      const userId = req.user.id; // user гарантирован в AuthRequest

      // Обработка медиа: берем поле media из тела запроса
      let uploadedMedia: string[] = [];
      if (bannerData.media && Array.isArray(bannerData.media)) {
        uploadedMedia = bannerData.media;
      }

      const banner = await bannerService.createBanner({
        bannerData,
        uploadedMedia,
        userId,
      });

      res.status(201).json({ success: true, data: banner });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Обновление баннера (требуется авторизация и права создателя или админа).
   */
  update = async (
    req: UpdateReq,
    res: Response<CommonResponse<BannerDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const bannerData = req.body;
      const userId = req.user.id;

      // Проверка существования баннера
      const existingBanner = await bannerService.getBannerById(id);
      if (!existingBanner) {
        throw ApiError.NotFoundError("Баннер не найден");
      }

      // Проверка прав: создатель или администратор (role === 'admin')
      if (
        existingBanner.createdBy.toString() !== userId &&
        req.user.role !== "admin"
      ) {
        throw ApiError.ForbiddenError(
          "Нет доступа для редактирования этого баннера",
        );
      }

      // Обработка медиа
      let uploadedMedia: string[] = [];
      if (bannerData.media && Array.isArray(bannerData.media)) {
        uploadedMedia = bannerData.media;
      }

      // Обработка deletedUrls (может быть строкой JSON или массивом)
      let deletedUrls: string[] = [];
      if (bannerData.deletedUrls) {
        if (typeof bannerData.deletedUrls === "string") {
          try {
            const parsed = JSON.parse(bannerData.deletedUrls);
            deletedUrls = Array.isArray(parsed)
              ? parsed
              : [parsed].filter(Boolean);
          } catch {
            deletedUrls = bannerData.deletedUrls
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } else if (Array.isArray(bannerData.deletedUrls)) {
          deletedUrls = bannerData.deletedUrls;
        }
      }

      const updatedBanner = await bannerService.updateBanner({
        id,
        bannerData,
        uploadedMedia,
        deletedUrls,
        userId,
      });

      res.json({ success: true, data: updatedBanner });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Получение списка баннеров с фильтрацией (не требует авторизации).
   */
  getAll = async (
    req: GetAllReq,
    res: Response<CommonResponse<BannerDocument[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { status } = req.query;
      const banners = await bannerService.listBanners({ status });
      res.json({ success: true, data: banners });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Получение одного баннера по ID (не требует авторизации).
   */
  getById = async (
    req: GetByIdReq,
    res: Response<CommonResponse<BannerDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const banner = await bannerService.getBannerById(req.params.id);
      if (!banner) {
        throw ApiError.NotFoundError("Баннер не найден");
      }
      res.json({ success: true, data: banner });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Удаление баннера (не требует авторизации, но должно быть ограничено в реальном приложении).
   * Сохранена исходная логика — удаление без проверки прав.
   */
  remove = async (
    req: RemoveReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
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
  };

  /**
   * Смена статуса баннера (не требует авторизации, но должно быть ограничено).
   */
  changeStatus = async (
    req: ChangeStatusReq,
    res: Response<CommonResponse<BannerDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updated = await bannerService.changeStatus(id, status);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Получение баннера для конкретного пользователя (требуется авторизация).
   * Возвращает массив с одним баннером или пустой массив.
   */
  getForUser = async (
    req: GetForUserReq,
    res: Response<CommonResponse<BannerDocument[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const banner = await bannerService.getBannerForUser(req.user);
      res.json({ success: true, data: banner ? [banner] : [] });
    } catch (err) {
      next(err);
    }
  };
}

export default new BannerController();
