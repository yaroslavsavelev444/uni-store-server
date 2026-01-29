const FileManager = require("../utils/fileManager");
const { BannerModel, BannerViewModel } = require("../models/index.models");
const ApiError = require("../exceptions/api-error");
const redis = require("../redis/redis.client");
const path = require("path");
class BannerService {
  /**
   * Парсит значение, которое может быть массивом
   */

  parseMaybeArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val.split(',').map(item => item.trim()).filter(Boolean);
      }
    }
    return [val];
  }


   async processBannerMedia(uploadedMedia = [], bannerId = null) {
    if (!uploadedMedia.length) return [];
    
    const movedFiles = [];
    
    for (const mediaUrl of uploadedMedia) {
      if (!mediaUrl || typeof mediaUrl !== 'string') continue;
      
      try {
        // Проверяем, является ли файл временным (находится в папке /temp/)
        if (mediaUrl.includes('/temp/')) {
          // Определяем целевую папку для баннера
          const targetFolder = bannerId ? `banners/${bannerId}` : 'banners/temp';
          
          // Извлекаем имя файла из URL
          const urlObj = new URL(mediaUrl);
          const tempPath = decodeURIComponent(urlObj.pathname);
          
          // Создаем новый путь в папке баннера
          const filename = path.basename(tempPath);
          const timestamp = Date.now();
          const newFilename = `${timestamp}_${filename}`;
          const permanentPath = `/uploads/${targetFolder}/${newFilename}`;
          
          // Перемещаем файл
          const movedPath = await FileManager.moveFile(tempPath, permanentPath);
          movedFiles.push(movedPath);
          
          console.log(`[BANNER_SERVICE] Медиа файл перемещен: ${tempPath} -> ${movedPath}`);
        } else {
          // Если файл уже в постоянной папке, просто проверяем его существование
          try {
            await FileManager.validateFileExists(mediaUrl);
            movedFiles.push(mediaUrl);
            console.log(`[BANNER_SERVICE] Медиа файл уже в постоянной папке: ${mediaUrl}`);
          } catch (error) {
            console.warn(`[BANNER_SERVICE] Файл не найден: ${mediaUrl}`, error.message);
          }
        }
      } catch (error) {
        console.error(`[BANNER_SERVICE] Ошибка обработки медиа файла ${mediaUrl}:`, error.message);
        // Не прерываем выполнение, продолжаем с другими файлами
      }
    }
    
    return movedFiles;
  }

  /**
   * Удаляет файлы баннера
   */
  async deleteBannerFiles(files = [], bannerId = null) {
    for (const url of files) {
      try {
        // Проверяем, принадлежит ли файл баннеру (опционально)
        if (bannerId && url.includes(`/banners/${bannerId}/`)) {
          await FileManager.deleteFile(url);
          console.log(`[BANNER_SERVICE] Файл баннера удален: ${url}`);
        } else if (url.includes('/uploads/')) {
          // Удаляем любой файл в uploads
          await FileManager.deleteFile(url);
          console.log(`[BANNER_SERVICE] Файл удален: ${url}`);
        }
      } catch (error) {
        console.error(`[BANNER_SERVICE] Ошибка удаления файла ${url}:`, error.message);
      }
    }
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

  async createBanner({ bannerData, uploadedMedia, userId }) {
    console.log('[BANNER_SERVICE] Создание баннера с данными:', {
      title: bannerData.title,
      mediaCount: uploadedMedia?.length || 0
    });

    // Сначала создаем баннер, чтобы получить его ID
    const banner = new BannerModel({
      title: bannerData.title,
      description: bannerData.description || null,
      subtitle: bannerData.subtitle || "",
      media: [], // Пока пустой массив, заполним после обработки медиа
      action: bannerData.action || "none",
      actionPayload: bannerData.actionPayload || null,
      repeatable: bannerData.repeatable === true || bannerData.repeatable === "true",
      priority: Number(bannerData.priority) || 0,
      targeting: {
        roles: bannerData.targeting?.roles 
          ? this.parseMaybeArray(bannerData.targeting.roles)
          : []
      },
      status: ['draft', 'active', 'archived'].includes(bannerData.status) 
        ? bannerData.status 
        : "draft",
      createdBy: userId,
    });

    // Обрабатываем даты
    if (bannerData.startAt) {
      banner.startAt = new Date(bannerData.startAt);
    }
    
    if (bannerData.endAt && bannerData.endAt !== "null" && bannerData.endAt !== "undefined") {
      banner.endAt = new Date(bannerData.endAt);
    } else {
      banner.endAt = null;
    }

    // Сохраняем баннер, чтобы получить его ID
    await banner.save();
    console.log('[BANNER_SERVICE] Баннер создан, ID:', banner._id);

    // Обрабатываем медиа-файлы с использованием ID баннера
    const processedMedia = await this.processBannerMedia(uploadedMedia, banner._id.toString());
    
    // Обновляем баннер с обработанными медиа
    banner.media = processedMedia;
    await banner.save();

    console.log('[BANNER_SERVICE] Баннер сохранен с медиа:', {
      id: banner._id,
      mediaCount: banner.media.length,
      media: banner.media
    });

    return banner;
  }

 async updateBanner({ id, bannerData, uploadedMedia, deletedUrls, userId }) {
    const banner = await BannerModel.findById(id);
    if (!banner) throw ApiError.NotFoundError("Баннер не найден");

    console.log('[BANNER_SERVICE] Обновление баннера:', {
      id,
      currentMedia: banner.media,
      newMediaCount: uploadedMedia?.length || 0,
      deletedUrlsCount: deletedUrls?.length || 0
    });

    // Удаляем старые файлы
    if (deletedUrls && deletedUrls.length > 0) {
      await this.deleteBannerFiles(deletedUrls, id);
      
      // Удаляем URL из массива медиа баннера
      banner.media = banner.media.filter((mediaUrl) => !deletedUrls.includes(mediaUrl));
      console.log(`[BANNER_SERVICE] Удалено ${deletedUrls.length} медиа файлов, осталось: ${banner.media.length}`);
    }

    // Обрабатываем и добавляем новые медиа-файлы
    if (uploadedMedia && uploadedMedia.length > 0) {
      // Фильтруем только новые файлы (те, которых еще нет в баннере)
      const existingUrls = new Set(banner.media);
      const newMedia = uploadedMedia.filter(url => !existingUrls.has(url));
      
      if (newMedia.length > 0) {
        const processedMedia = await this.processBannerMedia(newMedia, id);
        banner.media.push(...processedMedia);
        console.log(`[BANNER_SERVICE] Добавлено ${processedMedia.length} новых медиа файлов`);
      }
    }

    // Обновление остальных полей
    if (bannerData.title !== undefined) banner.title = bannerData.title;
    if (bannerData.subtitle !== undefined) banner.subtitle = bannerData.subtitle;
    if (bannerData.description !== undefined) banner.description = bannerData.description;
    if (bannerData.action !== undefined) banner.action = bannerData.action;
    if (bannerData.actionPayload !== undefined) banner.actionPayload = bannerData.actionPayload;
    
    if (bannerData.repeatable !== undefined) {
      banner.repeatable = bannerData.repeatable === true || bannerData.repeatable === "true";
    }
    
    if (bannerData.priority !== undefined) {
      banner.priority = Number(bannerData.priority);
    }

    // Обрабатываем targeting.roles
    if (bannerData.targeting && bannerData.targeting.roles !== undefined) {
      banner.targeting.roles = this.parseMaybeArray(bannerData.targeting.roles);
    }

    // Обрабатываем даты
    if (bannerData.startAt) {
      banner.startAt = new Date(bannerData.startAt);
    }
    
    if (bannerData.endAt === null || bannerData.endAt === "null") {
      banner.endAt = null;
    } else if (bannerData.endAt) {
      banner.endAt = new Date(bannerData.endAt);
    }

    // Обновляем статус
    if (bannerData.status !== undefined && bannerData.status !== null) {
      const statusStr = String(bannerData.status).trim();
      if (['draft', 'active', 'archived'].includes(statusStr)) {
        banner.status = statusStr;
      } else {
        console.warn(`[BANNER_SERVICE] Недопустимый статус: ${bannerData.status}`);
      }
    }

    banner.updatedBy = userId;
    banner.updatedAt = new Date();

    // Сохраняем обновленный баннер
    await banner.save();

    console.log('[BANNER_SERVICE] Баннер обновлен:', {
      id: banner._id,
      title: banner.title,
      status: banner.status,
      mediaCount: banner.media.length
    });

    return banner;
  }


  async getBannerById(id) {
    const banner = await BannerModel.findById(id);
    if (banner) {
      console.log('[BANNER_SERVICE] Получен баннер:', {
        id: banner._id,
        title: banner.title,
        mediaCount: banner.media?.length || 0
      });
    }
    return banner;
  }

  async deleteBanner(id) {
    const banner = await BannerModel.findById(id);
    if (!banner) return;
    
    console.log('[BANNER_SERVICE] Удаление баннера:', {
      id: banner._id,
      title: banner.title,
      mediaCount: banner.media?.length || 0
    });
    
    // Удаляем все файлы баннера
    if (banner.media && banner.media.length > 0) {
      await this.deleteBannerFiles(banner.media, id);
    }
    
    await banner.deleteOne();
    console.log('[BANNER_SERVICE] Баннер удален:', id);
  }


  async listBanners(filter = {}) {
    const query = {};
    if (filter.status) query.status = filter.status;
    return await BannerModel.find(query).sort({ createdAt: -1 });
  }

  async getBannerForUser(user) {
    const cooldownKey = `banner:cooldown:${user.id}`;
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) return null;

    // Получаем ID баннеров, которые пользователь уже видел
    const viewedBannerIds = await BannerViewModel.find({
      userId: user.id,
    }).distinct("bannerId");

    // Подготавливаем запрос для доступных баннеров
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

    // Добавляем фильтрацию по ролям
    if (user.role) {
      query.$or = [
        { "targeting.roles": { $exists: false } },
        { "targeting.roles": { $size: 0 } },
         { "targeting.roles": { $in: [user.role] } } 

      ];
    } else {
      query.$or = [
        { "targeting.roles": { $exists: false } },
        { "targeting.roles": { $size: 0 } }
      ];
    }

    // Получаем баннеры, сортируем по приоритету
    const banners = await BannerModel.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    if (!banners.length) return null;

    // Выбираем подходящий баннер с учетом repeatable
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

    // Устанавливаем глобальный cooldown
    const COOLDOWN_TTL = 600; // 10 минут
    await redis.set(cooldownKey, "1", "EX", COOLDOWN_TTL);

    // Фиксируем показ баннера
    const bannerKey = `banner:shown:${user.id}:${selectedBanner._id}`;
    await redis.set(bannerKey, "1", "EX", 60 * 60 * 24 * 7); // 7 дней

    // Если баннер repeatable - устанавливаем 24-часовой интервал
    if (selectedBanner.repeatable) {
      const repeatKey = `banner:repeat:${user.id}:${selectedBanner._id}`;
      await redis.set(repeatKey, "1", "EX", 60 * 60 * 24); // 24 часа
    }

    // Сохраняем запись о просмотре в MongoDB
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
    }

    return selectedBanner;
  }

//   async getBannerForUser(user) {
//     // ВАЖНО: Эта версия используется ТОЛЬКО для тестирования UI на клиенте
//     // Она НЕ должна использоваться в production!
//     console.log('[TEST MODE] Запрос баннера для пользователя (тестовый режим):', user.id);
    
//     // Пропускаем кулдаун для тестирования
//     // const cooldownKey = `banner:cooldown:${user.id}`;
//     // const inCooldown = await redis.get(cooldownKey);
//     // if (inCooldown) return null;

//     // Игнорируем просмотренные баннеры для тестирования
//     // const viewedBannerIds = await BannerViewModel.find({
//     //   userId: user.id,
//     // }).distinct("bannerId");

//     // Подготавливаем запрос для доступных баннеров
//     const now = new Date();
//     const query = {
//       // Игнорируем просмотренные: _id: { $nin: viewedBannerIds },
//       status: "active",
//       startAt: { $lte: now },
//       $or: [
//         { endAt: { $exists: false } },
//         { endAt: null },
//         { endAt: { $gte: now } }
//       ],
//     };

//     // Добавляем фильтрацию по ролям (оставляем для реалистичности тестирования)
//     if (user.role) {
//       query.$or = [
//         { "targeting.roles": { $exists: false } },
//         { "targeting.roles": { $size: 0 } },
//         { "targeting.roles": user.role }
//       ];
//     } else {
//       query.$or = [
//         { "targeting.roles": { $exists: false } },
//         { "targeting.roles": { $size: 0 } }
//       ];
//     }

//     // Получаем все активные баннеры
//     const banners = await BannerModel.find(query)
//       .sort({ priority: -1, createdAt: -1 })
//       .lean();

//     if (!banners.length) {
//       console.log('[TEST MODE] Нет активных баннеров для роли:', user.role);
//       return null;
//     }

//     // Для тестирования берем случайный баннер
//     // ИЛИ всегда первый для предсказуемости тестирования
//     const selectedBanner = banners[0]; // Всегда первый (с наивысшим приоритетом)
//     // const selectedBanner = banners[Math.floor(Math.random() * banners.length)]; // Случайный
    
//     console.log('[TEST MODE] Выбран баннер для тестирования:', {
//       id: selectedBanner._id,
//       title: selectedBanner.title,
//       priority: selectedBanner.priority,
//       totalAvailable: banners.length
//     });

//     // Пропускаем установку кулдауна для тестирования
//     // const COOLDOWN_TTL = 600; // 10 минут
//     // await redis.set(cooldownKey, "1", "EX", COOLDOWN_TTL);

//     // Пропускаем сохранение в Redis для тестирования
//     // const bannerKey = `banner:shown:${user.id}:${selectedBanner._id}`;
//     // await redis.set(bannerKey, "1", "EX", 60 * 60 * 24 * 7);

//     // Пропускаем установку интервала для repeatable баннеров
//     // if (selectedBanner.repeatable) {
//     //   const repeatKey = `banner:repeat:${user.id}:${selectedBanner._id}`;
//     //   await redis.set(repeatKey, "1", "EX", 60 * 60 * 24);
//     // }

//     // Сохраняем запись о просмотре в MongoDB (опционально, для аналитики)
//     // Можно оставить, если хотите отслеживать тестовые просмотры
//     try {
//       await BannerViewModel.findOneAndUpdate(
//         { userId: user.id, bannerId: selectedBanner._id },
//         { 
//           userId: user.id, 
//           bannerId: selectedBanner._id,
//           viewedAt: new Date(),
//           isTestView: true, // Добавляем флаг тестового просмотра
//           $setOnInsert: { createdAt: new Date() }
//         },
//         { upsert: true, new: true }
//       );
//       console.log('[TEST MODE] Запись о тестовом просмотре сохранена');
//     } catch (error) {
//       console.error("[TEST MODE] Ошибка при сохранении тестового просмотра баннера:", error);
//     }

//     return selectedBanner;
// }


  async changeStatus(id, status) {
    if (!['draft', 'active', 'archived'].includes(status)) {
      throw ApiError.BadRequestError("Неверный статус");
    }
    
    const banner = await BannerModel.findById(id);
    if (!banner) {
      throw ApiError.NotFoundError("Баннер не найден");
    }
    
    banner.status = status;
    banner.updatedAt = new Date();
    await banner.save();
    
    return banner;
  }
}

module.exports = new BannerService();