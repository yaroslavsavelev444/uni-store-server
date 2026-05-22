const ApiError = require("../exceptions/api-error");
const { ContentBlockModel } = require("../models/index.models");
const fileService = require("../utils/fileManager");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs").promises;
const redisClient = require("../redis/redis.client");
const logger = require("../logger/logger");
const xss = require("xss");

class ContentBlockService {
  constructor() {
    this.redisClient = redisClient;
    this.CACHE_KEYS = {
      ALL_BLOCKS: "contentBlocks:all",
      ACTIVE_BLOCKS: "contentBlocks:active",
      BLOCK_BY_ID: (id) => `contentBlocks:id:${id}`,
      BLOCKS_BY_TAG: (tag) => `contentBlocks:tag:${tag}`,
    };
    this.CACHE_TTL = {
      ALL: 300, // 5 минут
      ACTIVE: 1800, // 30 минут
      SINGLE: 600, // 10 минут
    };
  }

  // Инвалидация кеша
  async invalidateCache(...patterns) {
    try {
      for (const pattern of patterns) {
        await this.redisClient.deletePattern(pattern);
        logger.debug(
          `[ContentBlockService] Invalidated cache pattern: ${pattern}`
        );
      }
    } catch (err) {
      logger.error(
        `[ContentBlockService] Error invalidating cache: ${err.message}`
      );
    }
  }

  // Получение всех блоков
async getAll(includeInactive = false) {
  const cacheKey = includeInactive
    ? this.CACHE_KEYS.ALL_BLOCKS
    : this.CACHE_KEYS.ACTIVE_BLOCKS;

  try {
    const cached = await this.redisClient.getJson(cacheKey);
    if (cached) {
      logger.debug(
        `[ContentBlockService] getAll from cache (includeInactive: ${includeInactive})`
      );
      // Добавляем полные URL к изображениям в кешированных данных
      return cached.map(item => {
        if (item.imageUrl && item.imageUrl) {
          item.imageUrl = fileService.getFileUrl(item.imageUrl);
        }
        return item;
      });
    }
  } catch (err) {
    logger.warn(`[ContentBlockService] Cache get error: ${err.message}`);
  }

  const query = includeInactive ? {} : { isActive: true };
  const items = await ContentBlockModel.find(query)
    .sort({ position: 1, createdAt: -1 })
    .lean();


  try {
    await this.redisClient.setJson(
      cacheKey,
      items, // Сохраняем в кеш без fullUrl, чтобы не кешировать абсолютные URL
      includeInactive ? this.CACHE_TTL.ALL : this.CACHE_TTL.ACTIVE
    );
    logger.debug(
      `[ContentBlockService] getAll cached (includeInactive: ${includeInactive})`
    );
  } catch (err) {
    logger.warn(`[ContentBlockService] Cache set error: ${err.message}`);
  }

  return items;
}

  // Получение блока по ID
  async getById(id) {
    const cacheKey = this.CACHE_KEYS.BLOCK_BY_ID(id);

    try {
      const cached = await this.redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[ContentBlockService] getById ${id} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(`[ContentBlockService] Cache get error: ${err.message}`);
    }

    const item = await ContentBlockModel.findById(id).lean();

    if (item) {
      try {
        await this.redisClient.setJson(cacheKey, item, this.CACHE_TTL.SINGLE);
        logger.debug(`[ContentBlockService] getById ${id} cached`);
      } catch (err) {
        logger.warn(`[ContentBlockService] Cache set error: ${err.message}`);
      }
    }

    return item;
  }

  // Получение блоков по тегу
  async getByTag(tag) {
    const normalizedTag = tag.toLowerCase().trim();
    const cacheKey = this.CACHE_KEYS.BLOCKS_BY_TAG(normalizedTag);

    try {
      const cached = await this.redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[ContentBlockService] getByTag ${tag} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(`[ContentBlockService] Cache get error: ${err.message}`);
    }

    const items = await ContentBlockModel.find({
      tags: normalizedTag,
      isActive: true,
    })
      .sort({ position: 1, createdAt: -1 })
      .lean();

    try {
      await this.redisClient.setJson(cacheKey, items, this.CACHE_TTL.ACTIVE);
      logger.debug(`[ContentBlockService] getByTag ${tag} cached`);
    } catch (err) {
      logger.warn(`[ContentBlockService] Cache set error: ${err.message}`);
    }

    return items;
  }

  // Создание блока
  async create(contentBlockData, userId) {
    console.log("contentBlockData, userId", contentBlockData, userId);

    try {
      // Обрабатываем изображение
      if (contentBlockData.image?.url) {
        contentBlockData.imageUrl = await this.processImage(
          contentBlockData.imageUrl
        );
      }

      // Создаем блок
      const newBlock = await ContentBlockModel.create({
        ...contentBlockData,
        createdBy: userId,
        updatedBy: userId,
      });

      // Инвалидируем кеш
      await this.invalidateCache(
        "contentBlocks:all",
        "contentBlocks:active",
        "contentBlocks:tag:*"
      );

      return newBlock.toObject();
    } catch (err) {
      logger.error(
        `[ContentBlockService] Error creating block: ${err.message}`
      );
      throw err;
    }
  }

  // Обновление блока
  async update(id, updateData, userId) {
    console.log("id, updateData, userId", id, updateData, userId);

    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.BadRequest("Некорректный формат ID блока");
      }

      const existingBlock = await ContentBlockModel.findById(id);
      if (!existingBlock) {
        throw ApiError.BadRequest("Блок не найден");
      }

      if (updateData.imageUrl !== undefined) {
        if (updateData.imageUrl === null) {
          if (existingBlock.imageUrl) {
            await fileService.deleteFile(existingBlock.imageUrl);
          }
          updateData.image = null;
        } else if (updateData.imageUrl) {
          const newImageUrl = await this.processImage(updateData.imageUrl);
          console.log('newImageUrl' ,newImageUrl);
          
          // // Удаляем старое изображение
          // if (existingBlock.imageUrl) {
          //   await fileService.deleteFile(existingBlock.imageUrl);
          // }

          updateData.imageUrl = newImageUrl;
        }
      }

      // Обновляем блок
      Object.assign(existingBlock, updateData);
      existingBlock.createdBy = userId;
      existingBlock.updatedBy = userId;

      await existingBlock.save();

      // Инвалидируем кеш
      await this.invalidateCache(
        "contentBlocks:all",
        "contentBlocks:active",
        `contentBlocks:id:${id}`,
        "contentBlocks:tag:*"
      );

      return existingBlock.toObject();
    } catch (err) {
      logger.error(
        `[ContentBlockService] Error updating block ${id}: ${err.message}`
      );
      throw err;
    }
  }

  // Вспомогательный метод для обработки изображения (точно такой же как в категориях)
  async processImage(imageUrl) {
    console.log(`[ContentBlockService] processImage called with ${imageUrl}`);
    // Извлекаем путь из URL если это полный URL
    let filePath = imageUrl;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const url = new URL(imageUrl);
      filePath = url.pathname;
      
      // Декодируем URL-encoded символы
      filePath = decodeURIComponent(filePath);
      console.log(`[ContentBlockService] processImage: filePath after decoding is ${filePath}`);
    }
    
    // Проверяем, является ли файл временным
    if (filePath.includes('/temp/')) {
      console.log(`[ContentBlockService] processImage: file is temporary`);
      // Перемещаем файл в постоянную папку через fileService
      const timestamp = Date.now();
      const filename = path.basename(filePath);
      const newWebPath = `/uploads/content-blocks/${timestamp}_${filename}`;
      
      console.log('filePath' ,filePath);
      console.log('newWebPath' ,newWebPath);
      
      await fileService.moveFile(filePath, newWebPath);
      console.log(`[ContentBlockService] processImage: moved file to ${newWebPath}`);
      return newWebPath;
    }
    
    // Если файл уже в постоянной папке, просто проверяем его существование
    await fileService.validateFileExists(filePath);
    console.log(`[ContentBlockService] processImage: file exists at ${filePath}`);
    return filePath;
  }
  // Вспомогательный метод для обработки изображения
  // Удаление блока
  async delete(id) {
    try {
      const block = await ContentBlockModel.findById(id);
      if (!block) {
        throw ApiError.BadRequest("Блок не найден");
      }

      // Удаляем изображение если оно есть
      if (block.imageUrl) {
        await this.deleteOldImage(block.imageUrl);
      }

      // Удаляем блок
      await ContentBlockModel.findByIdAndDelete(id);

      // Инвалидируем кеш
      await this.invalidateCache(
        "contentBlocks:all",
        "contentBlocks:active",
        `contentBlocks:id:${id}`,
        "contentBlocks:tag:*"
      );

      return true;
    } catch (err) {
      logger.error(
        `[ContentBlockService] Error deleting block ${id}: ${err.message}`
      );
      throw err;
    }
  }

  // Активация/деактивация блока
  async toggleActive(id, isActive) {
    const updated = await ContentBlockModel.findByIdAndUpdate(
      id,
      { isActive, updatedAt: Date.now() },
      { new: true }
    );

    if (!updated) {
      throw ApiError.BadRequest("Блок не найден");
    }

    // Инвалидируем кеш
    await this.invalidateCache(
      "contentBlocks:all",
      "contentBlocks:active",
      `contentBlocks:id:${id}`,
      "contentBlocks:tag:*"
    );

    return updated;
  }

  // Перемещение изображения из временной папки

  // Удаление старого изображения
  async deleteOldImage(imageUrl) {
    try {
      if (imageUrl && imageUrl.startsWith("/uploads/content-blocks/")) {
        await fileService.deleteFile(imageUrl);
        logger.debug(`[ContentBlockService] Old image deleted: ${imageUrl}`);
      }
    } catch (err) {
      logger.warn(
        `[ContentBlockService] Error deleting old image ${imageUrl}: ${err.message}`
      );
      // Не прерываем выполнение если не удалось удалить файл
    }
  }

  // Получение статистики
  async getStats() {
    try {
      const total = await ContentBlockModel.countDocuments();
      const active = await ContentBlockModel.countDocuments({ isActive: true });
      const withImages = await ContentBlockModel.countDocuments({
        imageUrl: { $ne: null, $exists: true },
      });
      const withButtons = await ContentBlockModel.countDocuments({
        "button.text": { $ne: null, $exists: true },
      });

      return {
        total,
        active,
        inactive: total - active,
        withImages,
        withButtons,
        withoutImages: total - withImages,
        withoutButtons: total - withButtons,
      };
    } catch (err) {
      logger.error(`[ContentBlockService] Error getting stats: ${err.message}`);
      throw err;
    }
  }

  // Вспомогательный метод для массового обновления позиций
  async updatePositions(positionUpdates) {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        for (const update of positionUpdates) {
          await ContentBlockModel.findByIdAndUpdate(
            update.id,
            { position: update.position, updatedAt: Date.now() },
            { session }
          );
        }

        await session.commitTransaction();

        // Инвалидируем кеш
        await this.invalidateCache(
          "contentBlocks:all",
          "contentBlocks:active",
          "contentBlocks:tag:*"
        );

        return true;
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    } catch (err) {
      logger.error(
        `[ContentBlockService] Error updating positions: ${err.message}`
      );
      throw err;
    }
  }
}

module.exports = ContentBlockService;
