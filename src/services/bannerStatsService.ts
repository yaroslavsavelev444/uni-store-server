// services/BannerStatsService.ts
/** biome-ignore-all lint/suspicious/noDuplicateObjectKeys: <explanation> */
/** biome-ignore-all lint/complexity/useOptionalChain: <explanation> */
import ApiError from "../exceptions/api-error.js";
import { BannerModel, BannerViewModel } from "../models/index.models.js";
import type { IBanner } from "../types/banner.types.js";
import type {
  BannerViewDocument,
  IBannerView,
} from "../types/bannerView.types.js";

class BannerStatsService {
  /**
   * Получает информацию о баннере с проверкой доступности
   */
  private async getBannerInfo(bannerId: string): Promise<IBanner> {
    const now = new Date();

    const banner = await BannerModel.findOne({
      _id: bannerId,
      status: { $in: ["active", "draft"] },
      $and: [
        {
          $or: [
            { startAt: { $exists: false } },
            { startAt: null },
            { startAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { endAt: { $exists: false } },
            { endAt: null },
            { endAt: { $gte: now } },
          ],
        },
      ],
    }).lean();

    if (!banner) {
      throw ApiError.NotFoundError("Баннер не найден или не активен");
    }

    return banner;
  }

  /**
   * Проверяет, существует ли запись о просмотре
   */
  private async getExistingView(
    userId: string,
    bannerId: string,
  ): Promise<IBannerView | null> {
    return await BannerViewModel.findOne({ userId, bannerId }).lean();
  }

  /**
   * Помечает баннер как просмотренный
   */
  async markViewed(
    userId: string,
    bannerId: string,
  ): Promise<{ action: string; view: BannerViewDocument }> {
    await this.getBannerInfo(bannerId);
    const now = new Date();
    const existing = await this.getExistingView(userId, bannerId);

    if (existing && existing.viewedAt) {
      return {
        action: "already_viewed",
        view: existing as BannerViewDocument,
      };
    }

    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      {
        $setOnInsert: {
          userId,
          bannerId,
          viewedAt: now,
          createdAt: now,
        },
        $set: {
          viewedAt: now,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return {
      action: existing ? "viewed_updated" : "viewed_created",
      view: result as BannerViewDocument,
    };
  }

  /**
   * Помечает баннер как кликнутый
   */
  async markClicked(
    userId: string,
    bannerId: string,
  ): Promise<{ action: string; view: BannerViewDocument }> {
    await this.getBannerInfo(bannerId);
    const now = new Date();
    const existing = await this.getExistingView(userId, bannerId);

    if (!existing) {
      throw ApiError.BadRequest("Нельзя кликнуть непросмотренный баннер");
    }

    if (existing.clicked) {
      return {
        action: "already_clicked",
        view: existing as BannerViewDocument,
      };
    }

    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      {
        $set: {
          clicked: true,
          clickedAt: now,
          ...(!existing.viewedAt && { viewedAt: now }),
        },
      },
      { new: true },
    );

    return {
      action: "clicked",
      view: result as BannerViewDocument,
    };
  }

  /**
   * Помечает баннер как отклоненный
   */
  async markDismissed(
    userId: string,
    bannerId: string,
  ): Promise<{ action: string; view: BannerViewDocument }> {
    await this.getBannerInfo(bannerId);
    const now = new Date();
    const existing = await this.getExistingView(userId, bannerId);

    if (!existing) {
      throw ApiError.BadRequest("Нельзя отклонить непросмотренный баннер");
    }

    if (existing.dismissed) {
      return {
        action: "already_dismissed",
        view: existing as BannerViewDocument,
      };
    }

    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      {
        $set: {
          dismissed: true,
          dismissedAt: now,
          ...(!existing.viewedAt && { viewedAt: now }),
        },
      },
      { new: true },
    );

    return {
      action: "dismissed",
      view: result as BannerViewDocument,
    };
  }

  /**
   * Комбинированный метод для клика с автоматическим просмотром
   * (если пользователь кликнул сразу без явного просмотра)
   */
  async markViewedAndClicked(
    userId: string,
    bannerId: string,
  ): Promise<{ action: string; view: BannerViewDocument }> {
    await this.getBannerInfo(bannerId);
    const now = new Date();
    const existing = await this.getExistingView(userId, bannerId);

    if (existing && existing.clicked) {
      return {
        action: "already_clicked",
        view: existing as BannerViewDocument,
      };
    }

    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      {
        $setOnInsert: {
          userId,
          bannerId,
          createdAt: now,
        },
        $set: {
          viewedAt: now,
          clicked: true,
          clickedAt: now,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return {
      action: existing ? "viewed_and_clicked" : "created_viewed_and_clicked",
      view: result as BannerViewDocument,
    };
  }
}

export default new BannerStatsService();
