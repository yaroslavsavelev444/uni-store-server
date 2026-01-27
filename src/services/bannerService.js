const FileManager = require("../utils/fileManager");
const { BannerModel, BannerViewModel } = require("../models/index.models");
const ApiError = require("../exceptions/api-error");
const redis = require("../redis/redis.client");

class BannerService {
  /**
   * Парсит значение, которое может быть массивом
   */
  parseMaybeArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      return JSON.parse(val);
    } catch {
      return [val];
    }
  }

  /**
   * Перемещает загруженные файлы из временных в постоянные
   */
  async moveUploadedFiles(uploadedImage = []) {
    if (!uploadedImage.length) return [];
    
    const movedFiles = [];
    for (const image of uploadedImage) {
      if (image && typeof image === 'string') {
        try {
          // Преобразуем временный путь в постоянный
          const tempPath = image;
          const permanentPath = image.replace('/temp/', '/banners/');
          
          // Перемещаем файл
          const movedPath = await FileManager.moveFile(tempPath, permanentPath);
          movedFiles.push(movedPath);
        } catch (error) {
          console.error(`Ошибка перемещения файла ${image}:`, error);
        }
      }
    }
    return movedFiles;
  }

  /**
   * Удаляет файлы
   */
  async deleteFiles(files = []) {
    for (const url of files) {
      try {
        await FileManager.deleteFile(url);
      } catch (error) {
        console.error(`Ошибка удаления файла ${url}:`, error.message);
      }
    }
  }

  async createBanner({ bannerData, uploadedImage, userId }) {
    const mediaPaths = await this.moveUploadedFiles(uploadedImage);

    const targeting = {
      roles: this.parseMaybeArray(bannerData["targeting.roles"]),
    };

    const payload = {
      title: bannerData.title,
      description: bannerData.description || null,
      subtitle: bannerData.subtitle || "",
      media: mediaPaths,
      action: bannerData.action || "none",
      actionPayload: bannerData.actionPayload || null,
      repeatable: bannerData.repeatable === "true",
      priority: Number(bannerData.priority) || 0,
      targeting,
      status: bannerData.status || "draft",
      createdBy: userId,
    };

    if (bannerData.startAt) payload.startAt = new Date(bannerData.startAt);
    payload.endAt = bannerData.endAt && bannerData.endAt !== "null" ? new Date(bannerData.endAt) : null;

    return await BannerModel.create(payload);
  }

  async updateBanner({ id, bannerData, uploadedImage, deletedUrls, userId }) {
    const banner = await BannerModel.findById(id);
    if (!banner) throw ApiError.NotFoundError("Баннер не найден");

    if (!Array.isArray(uploadedImage)) uploadedImage = [];
    if (!Array.isArray(deletedUrls)) deletedUrls = [];

    // Удаляем старые файлы
    if (deletedUrls.length > 0) {
      await this.deleteFiles(deletedUrls);
      banner.media = banner.media.filter((m) => !deletedUrls.includes(m));
    }

    // Перемещаем новые файлы
    if (uploadedImage.length > 0) {
      const newFiles = await this.moveUploadedFiles(uploadedImage);
      banner.media.push(...newFiles);
    }

    // Обновление остальных полей
    banner.title = bannerData.title ?? banner.title;
    banner.subtitle = bannerData.subtitle ?? banner.subtitle;
    banner.description = bannerData.description ?? banner.description;
    banner.action = bannerData.action ?? banner.action;
    banner.actionPayload = bannerData.actionPayload ?? banner.actionPayload;
    banner.repeatable = bannerData.repeatable !== undefined ? bannerData.repeatable === "true" : banner.repeatable;
    banner.priority = bannerData.priority !== undefined ? Number(bannerData.priority) : banner.priority;

    if (bannerData["targeting.roles"] !== undefined) {
      banner.targeting = {
        roles: this.parseMaybeArray(bannerData["targeting.roles"] || banner.targeting?.roles),
      };
    }

    banner.startAt = bannerData.startAt ? new Date(bannerData.startAt) : banner.startAt;
    banner.endAt = bannerData.endAt && bannerData.endAt !== "null" ? new Date(bannerData.endAt) : null;
    banner.status = bannerData.status ?? banner.status;
    banner.updatedBy = userId;

    await banner.save();
    return banner;
  }

  async getBannerById(id) {
    return await BannerModel.findById(id);
  }

  async deleteBanner(id) {
    const banner = await BannerModel.findById(id);
    if (!banner) return;
    
    // Удаляем файлы баннера
    if (banner.media && banner.media.length > 0) {
      await this.deleteFiles(banner.media);
    }
    
    await banner.deleteOne();
  }

  async listBanners(filter = {}) {
    const query = {};
    if (filter.status) query.status = filter.status;
    return await BannerModel.find(query).sort({ createdAt: -1 });
  }

  async getBannerForUser(user) {
    // 1️⃣ Проверяем глобальный cooldown
    const cooldownKey = `banner:cooldown:${user.id}`;
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) return null;

    // 2️⃣ Получаем ID баннеров, которые пользователь уже видел
    const viewedBannerIds = await BannerViewModel.find({
      userId: user.id,
    }).distinct("bannerId");

    // 3️⃣ Подготавливаем запрос для доступных баннеров
    const now = new Date();
    const query = {
      _id: { $nin: viewedBannerIds },
      status: "active",
      startAt: { $lte: now },
      $or: [
        { endAt: { $exists: false } },
        { endAt: null },
        { endAt: { $gte: now } }
      ],
    };

    // 4️⃣ Добавляем фильтрацию по ролям
    if (user.role) {
      query.$or = [
        { "targeting.roles": { $exists: false } },
        { "targeting.roles": { $size: 0 } },
        { "targeting.roles": user.role }
      ];
    } else {
      query.$or = [
        { "targeting.roles": { $exists: false } },
        { "targeting.roles": { $size: 0 } }
      ];
    }

    // 5️⃣ Получаем баннеры, сортируем по приоритету
    const banners = await BannerModel.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    if (!banners.length) return null;

    // 6️⃣ Выбираем подходящий баннер с учетом repeatable
    let selectedBanner = null;
    
    for (const banner of banners) {
      // Для non-repeatable баннеров проверяем, не показывали ли мы его ранее
      if (!banner.repeatable) {
        // Проверяем в Redis, показывали ли этот баннер пользователю
        const bannerKey = `banner:shown:${user.id}:${banner._id}`;
        const wasShown = await redis.get(bannerKey);
        
        if (!wasShown) {
          selectedBanner = banner;
          break;
        }
      } else {
        // Для repeatable баннеров проверяем 24-часовой интервал
        const repeatKey = `banner:repeat:${user.id}:${banner._id}`;
        const lastShown = await redis.get(repeatKey);
        
        if (!lastShown) {
          selectedBanner = banner;
          break;
        }
      }
    }

    if (!selectedBanner) return null;

    // 7️⃣ Устанавливаем глобальный cooldown
    const COOLDOWN_TTL = 600; // 10 минут
    await redis.set(cooldownKey, "1", "EX", COOLDOWN_TTL);

    // 8️⃣ Фиксируем показ баннера
    const bannerKey = `banner:shown:${user.id}:${selectedBanner._id}`;
    await redis.set(bannerKey, "1", "EX", 60 * 60 * 24 * 7); // 7 дней

    // 9️⃣ Если баннер repeatable - устанавливаем 24-часовой интервал
    if (selectedBanner.repeatable) {
      const repeatKey = `banner:repeat:${user.id}:${selectedBanner._id}`;
      await redis.set(repeatKey, "1", "EX", 60 * 60 * 24); // 24 часа
    }

    // 🔟 Сохраняем запись о просмотре в MongoDB
    try {
      await BannerViewModel.findOneAndUpdate(
        { userId: user.id, bannerId: selectedBanner._id },
        { 
          userId: user.id, 
          bannerId: selectedBanner._id,
          viewedAt: new Date(),
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error("Ошибка при сохранении просмотра баннера:", error);
      // Не прерываем выполнение, если не удалось сохранить в MongoDB
    }

    return selectedBanner;
  }

  async changeStatus(id, status) {
    return await BannerModel.findByIdAndUpdate(id, { status }, { new: true });
  }
}

module.exports = new BannerService();