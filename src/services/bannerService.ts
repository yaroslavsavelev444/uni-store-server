// services/BannerService.ts
import path from "node:path";
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { BannerModel, BannerViewModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type {
  BannerDocument,
  BannerStatusType,
  IBanner,
} from "../types/banner.types.js";

// Минимальный интерфейс для redis клиента
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
  del(key: string): Promise<number>;
  deletePattern(pattern: string): Promise<unknown>;
}
const redis = redisClient as unknown as RedisClient;

// Минимальный интерфейс пользователя для метода getBannerForUser
interface MinimalUser {
  id: string;
  role?: string;
}

class BannerService {
  /**
   * Парсит значение, которое может быть массивом
   */
  private parseMaybeArray<T = unknown>(val: unknown): T[] {
    if (!val) return [];
    if (Array.isArray(val)) return val as T[];
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return val
          .split(",")
          .map((item) => item.trim() as T)
          .filter(Boolean);
      }
    }
    return [val] as T[];
  }

  private async processBannerMedia(
    uploadedMedia: string[] = [],
    bannerId: string | null = null,
  ): Promise<string[]> {
    if (!uploadedMedia.length) return [];

    const movedFiles: string[] = [];

    for (const mediaUrl of uploadedMedia) {
      if (!mediaUrl || typeof mediaUrl !== "string") continue;

      // try {
      //   if (mediaUrl.includes("/temp/")) {
      //     const targetFolder = bannerId
      //       ? `banners/${bannerId}`
      //       : "banners/temp";
      //     const urlObj = new URL(mediaUrl);
      //     const tempPath = decodeURIComponent(urlObj.pathname);
      //     const filename = path.basename(tempPath);
      //     const timestamp = Date.now();
      //     const newFilename = `${timestamp}_${filename}`;
      //     const permanentPath = `/uploads/${targetFolder}/${newFilename}`;

      //     const movedPath = await FileManager.moveFile(tempPath, permanentPath);
      //     movedFiles.push(movedPath);
      //     console.log(
      //       `[BANNER_SERVICE] Медиа файл перемещен: ${tempPath} -> ${movedPath}`,
      //     );
      //   } else {
      //     try {
      //       await FileManager.validateFileExists(mediaUrl);
      //       movedFiles.push(mediaUrl);
      //       console.log(
      //         `[BANNER_SERVICE] Медиа файл уже в постоянной папке: ${mediaUrl}`,
      //       );
      //     } catch (error) {
      //       console.warn(
      //         `[BANNER_SERVICE] Файл не найден: ${mediaUrl}`,
      //         (error as Error).message,
      //       );
      //     }
      //   }
      // } catch (error) {
      //   console.error(
      //     `[BANNER_SERVICE] Ошибка обработки медиа файла ${mediaUrl}:`,
      //     (error as Error).message,
      //   );
      // }
    }
    return movedFiles;
  }

  private async deleteBannerFiles(
    files: string[] = [],
    bannerId?: string | null,
  ): Promise<void> {
    for (const url of files) {
      try {
        // if (bannerId && url.includes(`/banners/${bannerId}/`)) {
        //   await FileManager.deleteFile(url);
        //   console.log(`[BANNER_SERVICE] Файл баннера удален: ${url}`);
        // } else if (url.includes("/uploads/")) {
        //   await FileManager.deleteFile(url);
        //   console.log(`[BANNER_SERVICE] Файл удален: ${url}`);
        // }
      } catch (error) {
        console.error(
          `[BANNER_SERVICE] Ошибка удаления файла ${url}:`,
          (error as Error).message,
        );
      }
    }
  }

  private async deleteFiles(files: string[] = []): Promise<void> {
    for (const url of files) {
      try {
        // await FileManager.deleteFile(url);
      } catch (error) {
        console.error(
          `Ошибка удаления файла ${url}:`,
          (error as Error).message,
        );
      }
    }
  }

  async createBanner({
    bannerData,
    uploadedMedia,
    userId,
  }: {
    bannerData: Record<string, unknown>;
    uploadedMedia?: string[];
    userId: string;
  }): Promise<BannerDocument> {
    console.log("[BANNER_SERVICE] Создание баннера с данными:", {
      title: bannerData.title,
      mediaCount: uploadedMedia?.length || 0,
    });

    const banner = new BannerModel({
      title: bannerData.title,
      description: bannerData.description || null,
      subtitle: bannerData.subtitle || "",
      media: [],
      action: bannerData.action || "none",
      actionPayload: bannerData.actionPayload || null,
      repeatable:
        bannerData.repeatable === true || bannerData.repeatable === "true",
      priority: Number(bannerData.priority) || 0,
      targeting: {
        roles:
          bannerData.targeting && typeof bannerData.targeting === "object"
            ? this.parseMaybeArray<string>(
                (bannerData.targeting as { roles?: unknown }).roles,
              )
            : [],
      },
      status: ["draft", "active", "archived"].includes(
        String(bannerData.status),
      )
        ? (bannerData.status as BannerStatusType)
        : "draft",
      createdBy: userId,
    });

    if (bannerData.startAt) {
      banner.startAt = new Date(bannerData.startAt as string | Date);
    }
    const endAt = bannerData.endAt;
    if (endAt && endAt !== "null" && endAt !== "undefined") {
      banner.endAt = new Date(endAt as string | Date);
    } else {
      banner.endAt = null;
    }

    await banner.save();
    console.log("[BANNER_SERVICE] Баннер создан, ID:", banner._id);

    const processedMedia = await this.processBannerMedia(
      uploadedMedia,
      banner._id.toString(),
    );
    banner.media = processedMedia;
    await banner.save();

    console.log("[BANNER_SERVICE] Баннер сохранен с медиа:", {
      id: banner._id,
      mediaCount: banner.media.length,
      media: banner.media,
    });

    return banner;
  }

  async updateBanner({
    id,
    bannerData,
    uploadedMedia,
    deletedUrls,
    userId,
  }: {
    id: string;
    bannerData: Record<string, unknown>;
    uploadedMedia?: string[];
    deletedUrls?: string[];
    userId: string;
  }): Promise<BannerDocument> {
    const banner = await BannerModel.findById(id);
    if (!banner) throw ApiError.NotFoundError("Баннер не найден");

    console.log("[BANNER_SERVICE] Обновление баннера:", {
      id,
      currentMedia: banner.media,
      newMediaCount: uploadedMedia?.length || 0,
      deletedUrlsCount: deletedUrls?.length || 0,
    });

    if (deletedUrls && deletedUrls.length > 0) {
      await this.deleteBannerFiles(deletedUrls, id);
      banner.media = banner.media.filter((url) => !deletedUrls!.includes(url));
      console.log(
        `[BANNER_SERVICE] Удалено ${deletedUrls.length} медиа файлов, осталось: ${banner.media.length}`,
      );
    }

    if (uploadedMedia && uploadedMedia.length > 0) {
      const existingUrls = new Set(banner.media);
      const newMedia = uploadedMedia.filter((url) => !existingUrls.has(url));
      if (newMedia.length > 0) {
        const processedMedia = await this.processBannerMedia(newMedia, id);
        banner.media.push(...processedMedia);
        console.log(
          `[BANNER_SERVICE] Добавлено ${processedMedia.length} новых медиа файлов`,
        );
      }
    }

    if (bannerData.title !== undefined) banner.title = String(bannerData.title);
    if (bannerData.subtitle !== undefined)
      banner.subtitle = String(bannerData.subtitle);
    if (bannerData.description !== undefined)
      banner.description = String(bannerData.description);
    if (bannerData.action !== undefined)
      banner.action = String(bannerData.action) as IBanner["action"];
    if (bannerData.actionPayload !== undefined)
      banner.actionPayload = String(bannerData.actionPayload);
    if (bannerData.repeatable !== undefined) {
      banner.repeatable =
        bannerData.repeatable === true || bannerData.repeatable === "true";
    }
    if (bannerData.priority !== undefined) {
      banner.priority = Number(bannerData.priority);
    }
    if (bannerData.targeting && typeof bannerData.targeting === "object") {
      const roles = (bannerData.targeting as { roles?: unknown }).roles;
      if (roles !== undefined) {
        banner.targeting.roles = this.parseMaybeArray<string>(roles);
      }
    }
    if (bannerData.startAt) {
      banner.startAt = new Date(bannerData.startAt as string | Date);
    }
    if (bannerData.endAt === null || bannerData.endAt === "null") {
      banner.endAt = null;
    } else if (bannerData.endAt) {
      banner.endAt = new Date(bannerData.endAt as string | Date);
    }
    if (bannerData.status !== undefined && bannerData.status !== null) {
      const statusStr = String(bannerData.status).trim();
      if (["draft", "active", "archived"].includes(statusStr)) {
        banner.status = statusStr as BannerStatusType;
      } else {
        console.warn(
          `[BANNER_SERVICE] Недопустимый статус: ${bannerData.status}`,
        );
      }
    }

    banner.updatedBy = new Types.ObjectId(userId);
    banner.updatedAt = new Date();
    await banner.save();

    console.log("[BANNER_SERVICE] Баннер обновлен:", {
      id: banner._id,
      title: banner.title,
      status: banner.status,
      mediaCount: banner.media.length,
    });

    return banner;
  }

  async getBannerById(id: string): Promise<BannerDocument | null> {
    const banner = await BannerModel.findById(id);
    if (banner) {
      console.log("[BANNER_SERVICE] Получен баннер:", {
        id: banner._id,
        title: banner.title,
        mediaCount: banner.media?.length || 0,
      });
    }
    return banner;
  }

  async deleteBanner(id: string): Promise<void> {
    const banner = await BannerModel.findById(id);
    if (!banner) return;

    console.log("[BANNER_SERVICE] Удаление баннера:", {
      id: banner._id,
      title: banner.title,
      mediaCount: banner.media?.length || 0,
    });

    if (banner.media && banner.media.length > 0) {
      await this.deleteBannerFiles(banner.media, id);
    }
    await banner.deleteOne();
    console.log("[BANNER_SERVICE] Баннер удален:", id);
  }

  async listBanners(
    filter: { status?: string } = {},
  ): Promise<BannerDocument[]> {
    const query: Partial<Pick<IBanner, "status">> = {};
    if (filter.status) query.status = filter.status as IBanner["status"];
    return await BannerModel.find(query).sort({ createdAt: -1 });
  }

  async getBannerForUser(user: MinimalUser): Promise<IBanner | null> {
    const cooldownKey = `banner:cooldown:${user.id}`;
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) return null;

    const viewedBannerIds = await BannerViewModel.find({
      userId: user.id,
    }).distinct("bannerId");
    const now = new Date();
    const query: any = {
      _id: { $nin: viewedBannerIds },
      status: "active",
      startAt: { $lte: now },
      $or: [
        { endAt: { $exists: false } },
        { endAt: null },
        { endAt: { $gte: now } },
      ],
    };

    if (user.role) {
      query.$or = [
        { "targeting.roles": { $exists: false } },
        { "targeting.roles": { $size: 0 } },
        { "targeting.roles": { $in: [user.role] } },
      ];
    } else {
      query.$or = [
        { "targeting.roles": { $exists: false } },
        { "targeting.roles": { $size: 0 } },
      ];
    }

    const banners = await BannerModel.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .lean();
    if (!banners.length) return null;

    let selectedBanner: IBanner | null = null;
    for (const banner of banners) {
      if (!banner.repeatable) {
        const bannerKey = `banner:shown:${user.id}:${banner._id}`;
        const wasShown = await redis.get(bannerKey);
        if (!wasShown) {
          selectedBanner = banner;
          break;
        }
      } else {
        const repeatKey = `banner:repeat:${user.id}:${banner._id}`;
        const lastShown = await redis.get(repeatKey);
        if (!lastShown) {
          selectedBanner = banner;
          break;
        }
      }
    }

    if (!selectedBanner) return null;

    const COOLDOWN_TTL = 600;
    await redis.set(cooldownKey, "1", "EX", COOLDOWN_TTL);

    const bannerKey = `banner:shown:${user.id}:${selectedBanner._id}`;
    await redis.set(bannerKey, "1", "EX", 60 * 60 * 24 * 7);

    if (selectedBanner.repeatable) {
      const repeatKey = `banner:repeat:${user.id}:${selectedBanner._id}`;
      await redis.set(repeatKey, "1", "EX", 60 * 60 * 24);
    }

    try {
      await BannerViewModel.findOneAndUpdate(
        { userId: user.id, bannerId: selectedBanner._id },
        {
          userId: user.id,
          bannerId: selectedBanner._id,
          viewedAt: new Date(),
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, new: true },
      );
    } catch (error) {
      console.error("Ошибка при сохранении просмотра баннера:", error);
    }

    return selectedBanner;
  }

  async changeStatus(id: string, status: string): Promise<BannerDocument> {
    if (!["draft", "active", "archived"].includes(status)) {
      throw ApiError.BadRequest("Неверный статус");
    }
    const banner = await BannerModel.findById(id);
    if (!banner) {
      throw ApiError.NotFoundError("Баннер не найден");
    }
    banner.status = status as BannerStatusType;
    banner.updatedAt = new Date();
    await banner.save();
    return banner;
  }
}

export default new BannerService();
