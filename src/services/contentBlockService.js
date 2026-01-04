const ApiError = require('../exceptions/api-error');
const {ContentBlockModel} = require('../models/index.models');
const FileManager = require('../utils/fileManager');
const redisClient = require('../redis/redis.client');
const logger = require('../logger/logger');
const xss = require('xss');

class ContentBlockService {
  constructor() {
    this.redisClient = redisClient;
    this.CACHE_KEYS = {
      ALL_BLOCKS: 'contentBlocks:all',
      ACTIVE_BLOCKS: 'contentBlocks:active',
      BLOCK_BY_ID: (id) => `contentBlocks:id:${id}`,
      BLOCKS_BY_TAG: (tag) => `contentBlocks:tag:${tag}`
    };
    this.CACHE_TTL = {
      ALL: 300,      // 5 минут
      ACTIVE: 1800,   // 30 минут
      SINGLE: 600     // 10 минут
    };
  }

  // Инвалидация кеша
  async invalidateCache(...patterns) {
    try {
      for (const pattern of patterns) {
        await this.redisClient.deletePattern(pattern);
        logger.debug(`[ContentBlockService] Invalidated cache pattern: ${pattern}`);
      }
    } catch (err) {
      logger.error(`[ContentBlockService] Error invalidating cache: ${err.message}`);
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
        logger.debug(`[ContentBlockService] getAll from cache (includeInactive: ${includeInactive})`);
        return cached;
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
        items,
        includeInactive ? this.CACHE_TTL.ALL : this.CACHE_TTL.ACTIVE
      );
      logger.debug(`[ContentBlockService] getAll cached (includeInactive: ${includeInactive})`);
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
        await this.redisClient.setJson(
          cacheKey,
          item,
          this.CACHE_TTL.SINGLE
        );
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
      isActive: true
    })
      .sort({ position: 1, createdAt: -1 })
      .lean();

    try {
      await this.redisClient.setJson(
        cacheKey,
        items,
        this.CACHE_TTL.ACTIVE
      );
      logger.debug(`[ContentBlockService] getByTag ${tag} cached`);
    } catch (err) {
      logger.warn(`[ContentBlockService] Cache set error: ${err.message}`);
    }

    return items;
  }

  // Создание блока
  async create(data, tempImagePath = null) {
    try {
      // Если есть путь к изображению, обрабатываем его
      if (tempImagePath) {
        await this.processImage(tempImagePath, data);
      }

      const newBlock = await ContentBlockModel.create(data);
      
      // Инвалидируем кеш
      await this.invalidateCache(
        'contentBlocks:all',
        'contentBlocks:active',
        'contentBlocks:tag:*'
      );

      return newBlock;
    } catch (err) {
      logger.error(`[ContentBlockService] Error creating block: ${err.message}`);
      throw err;
    }
  }

  // Обновление блока
  async update(id, data, tempImagePath = null) {
    try {
      const existingBlock = await ContentBlockModel.findById(id);
      if (!existingBlock) {
        throw ApiError.BadRequest('Блок не найден');
      }

      // Если есть новое изображение, обрабатываем его
      if (tempImagePath) {
        // Удаляем старое изображение если оно есть
        if (existingBlock.imageUrl) {
          await this.deleteOldImage(existingBlock.imageUrl);
        }
        
        // Обрабатываем новое изображение
        await this.processImage(tempImagePath, data);
      }

      // Обновляем блок
      const updatedBlock = await ContentBlockModel.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true }
      );

      // Инвалидируем кеш
      await this.invalidateCache(
        'contentBlocks:all',
        'contentBlocks:active',
        `contentBlocks:id:${id}`,
        'contentBlocks:tag:*'
      );

      return updatedBlock;
    } catch (err) {
      logger.error(`[ContentBlockService] Error updating block ${id}: ${err.message}`);
      throw err;
    }
  }

  // Удаление блока
  async delete(id) {
    try {
      const block = await ContentBlockModel.findById(id);
      if (!block) {
        throw ApiError.BadRequest('Блок не найден');
      }

      // Удаляем изображение если оно есть
      if (block.imageUrl) {
        await this.deleteOldImage(block.imageUrl);
      }

      // Удаляем блок
      await ContentBlockModel.findByIdAndDelete(id);

      // Инвалидируем кеш
      await this.invalidateCache(
        'contentBlocks:all',
        'contentBlocks:active',
        `contentBlocks:id:${id}`,
        'contentBlocks:tag:*'
      );

      return true;
    } catch (err) {
      logger.error(`[ContentBlockService] Error deleting block ${id}: ${err.message}`);
      throw err;
    }
  }

  // Активация/деактивация блока
  async toggleActive(id, isActive) {
    const updated = await ContentBlockModel.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    if (!updated) {
      throw ApiError.BadRequest('Блок не найден');
    }

    // Инвалидируем кеш
    await this.invalidateCache(
      'contentBlocks:all',
      'contentBlocks:active',
      `contentBlocks:id:${id}`,
      'contentBlocks:tag:*'
    );

    return updated;
  }

  // Обработка изображения
  async processImage(tempImagePath, data) {
    try {
      // Валидируем файл
      const isValid = await FileManager.validateFileExists(tempImagePath);
      if (!isValid) {
        throw new Error('Изображение не найдено во временной папке');
      }

      // Генерируем уникальное имя для файла
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 10);
      const fileName = `content-${timestamp}-${randomString}${this.getFileExtension(tempImagePath)}`;
      
      // Путь для постоянного хранения
      const permanentPath = `/uploads/content-blocks/${fileName}`;
      
      // Перемещаем файл
      const movedPath = await FileManager.moveFile(tempImagePath, permanentPath);
      
      // Сохраняем путь в данных
      data.imageUrl = movedPath;

    } catch (err) {
      logger.error(`[ContentBlockService] Error processing image: ${err.message}`);
      throw ApiError.BadRequest(`Ошибка обработки изображения: ${err.message}`);
    }
  }

  // Удаление старого изображения
  async deleteOldImage(imageUrl) {
    try {
      if (imageUrl && imageUrl.startsWith('/uploads/content-blocks/')) {
        await FileManager.deleteFile(imageUrl);
        logger.debug(`[ContentBlockService] Old image deleted: ${imageUrl}`);
      }
    } catch (err) {
      logger.warn(`[ContentBlockService] Error deleting old image ${imageUrl}: ${err.message}`);
      // Не прерываем выполнение если не удалось удалить файл
    }
  }

  // Получение расширения файла
  getFileExtension(filePath) {
    const match = filePath.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
    return match ? match[0] : '.jpg';
  }

  // Получение статистики
  async getStats() {
    try {
      const total = await ContentBlockModel.countDocuments();
      const active = await ContentBlockModel.countDocuments({ isActive: true });
      const withImages = await ContentBlockModel.countDocuments({ 
        imageUrl: { $ne: null, $exists: true } 
      });
      const withButtons = await ContentBlockModel.countDocuments({
        'button.text': { $ne: null, $exists: true }
      });

      return {
        total,
        active,
        inactive: total - active,
        withImages,
        withButtons,
        withoutImages: total - withImages,
        withoutButtons: total - withButtons
      };
    } catch (err) {
      logger.error(`[ContentBlockService] Error getting stats: ${err.message}`);
      throw err;
    }
  }
}

module.exports = ContentBlockService;