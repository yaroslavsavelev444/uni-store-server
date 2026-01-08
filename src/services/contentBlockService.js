const ApiError = require('../exceptions/api-error');
const {ContentBlockModel} = require('../models/index.models');
const fileService = require('../utils/fileManager');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
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
  async create(contentBlockData, userId) {
    try {
      // Обрабатываем изображение
      if (contentBlockData.imageUrl) {
        // Извлекаем путь из URL если это полный URL
        let imageUrl = contentBlockData.imageUrl;
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          const url = new URL(imageUrl);
          imageUrl = url.pathname; // Извлекаем только путь
          
          // Декодируем URL-encoded символы
          imageUrl = decodeURIComponent(imageUrl);
          contentBlockData.imageUrl = imageUrl;
          logger.debug(`[ContentBlockService] Извлечен и декодирован путь из URL: ${imageUrl}`);
        }
        
        // Если путь из temp, перемещаем
        if (imageUrl.includes('/temp/')) {
          const newPath = await this.moveImageFromTemp(imageUrl);
          contentBlockData.imageUrl = newPath;
        } else {
          // Если уже постоянный путь, проверяем существование
          await fileService.validateFileExists(imageUrl);
        }
      }

      // Создаем блок
      const newBlock = await ContentBlockModel.create({
        ...contentBlockData,
        createdBy: userId,
        updatedBy: userId
      });
      
      // Инвалидируем кеш
      await this.invalidateCache(
        'contentBlocks:all',
        'contentBlocks:active',
        'contentBlocks:tag:*'
      );

      return newBlock.toObject();
    } catch (err) {
      logger.error(`[ContentBlockService] Error creating block: ${err.message}`);
      throw err;
    }
  }

  // Обновление блока
  async update(id, updateData, userId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.BadRequest('Некорректный формат ID блока');
      }
      
      const existingBlock = await ContentBlockModel.findById(id);
      if (!existingBlock) {
        throw ApiError.BadRequest('Блок не найден');
      }

      // Обрабатываем изображение
      if (updateData.imageUrl !== undefined) {
        // Если передано null или пустая строка - удаляем изображение
        if (updateData.imageUrl === null || updateData.imageUrl === '') {
          if (existingBlock.imageUrl) {
            await this.deleteOldImage(existingBlock.imageUrl);
          }
          updateData.imageUrl = null;
        } 
        // Если передан URL
        else if (updateData.imageUrl) {
          // Извлекаем путь из URL если это полный URL
          let imageUrl = updateData.imageUrl;
          if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            const url = new URL(imageUrl);
            imageUrl = url.pathname; // Извлекаем только путь
            
            // Декодируем URL-encoded символы
            imageUrl = decodeURIComponent(imageUrl);
            updateData.imageUrl = imageUrl;
            logger.debug(`[ContentBlockService] Извлечен и декодирован путь из URL: ${imageUrl}`);
          }
          
          if (imageUrl.includes('/temp/')) {
            const newPath = await this.moveImageFromTemp(imageUrl);
            
            // Удаляем старое изображение
            if (existingBlock.imageUrl) {
              await this.deleteOldImage(existingBlock.imageUrl);
            }
            
            updateData.imageUrl = newPath;
          } else {
            // Если уже постоянный путь, проверяем существование
            await fileService.validateFileExists(imageUrl);
            
            // Если путь изменился, удаляем старое изображение
            if (existingBlock.imageUrl && existingBlock.imageUrl !== imageUrl) {
              await this.deleteOldImage(existingBlock.imageUrl);
            }
          }
        }
      }

      // Обновляем блок
      Object.assign(existingBlock, updateData);
      existingBlock.updatedBy = userId;
      existingBlock.updatedAt = Date.now();
      
      await existingBlock.save();

      // Инвалидируем кеш
      await this.invalidateCache(
        'contentBlocks:all',
        'contentBlocks:active',
        `contentBlocks:id:${id}`,
        'contentBlocks:tag:*'
      );

      return existingBlock.toObject();
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
      { isActive, updatedAt: Date.now() },
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

  // Перемещение изображения из временной папки
  async moveImageFromTemp(tempPath) {
    logger.debug(`[ContentBlockService] moveImageFromTemp вызван с путем: ${tempPath}`);
    
    // Извлекаем путь из URL если это полный URL
    let cleanPath = tempPath;
    if (tempPath.startsWith('http://') || tempPath.startsWith('https://')) {
      const url = new URL(tempPath);
      cleanPath = url.pathname; // Извлекаем только путь
      
      // Декодируем URL-encoded символы (например, %20 -> пробел)
      cleanPath = decodeURIComponent(cleanPath);
      logger.debug(`[ContentBlockService] Извлечен и декодирован путь из URL: ${cleanPath}`);
    }
    
    // Проверяем, что путь ведет в temp
    if (!cleanPath.includes('/temp/')) {
      logger.debug(`[ContentBlockService] Путь не из temp, возвращаем как есть: ${cleanPath}`);
      return cleanPath; // Если уже не из temp, возвращаем как есть
    }
    
    // Проверяем существование файла
    await fileService.validateFileExists(cleanPath);
    
    // Генерируем новый путь
    const filename = path.basename(cleanPath);
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const newWebPath = `/uploads/content-blocks/${timestamp}_${randomString}_${filename}`;
    
    // Получаем абсолютные пути файловой системы
    const sourceAbsolute = fileService.getAbsolutePath(cleanPath);
    const targetAbsolute = fileService.getAbsolutePath(newWebPath);
    
    // Создаем папку назначения если нет
    const targetDir = path.dirname(targetAbsolute);
    await fs.mkdir(targetDir, { recursive: true });
    
    logger.debug(`[ContentBlockService] Перемещение файла:`);
    logger.debug(`  Из (абсолютный): ${sourceAbsolute}`);
    logger.debug(`  В (абсолютный):  ${targetAbsolute}`);
    logger.debug(`  В (веб-путь):    ${newWebPath}`);
    
    // Проверяем, что исходный файл существует
    try {
      await fs.access(sourceAbsolute);
      logger.debug(`[ContentBlockService] Исходный файл существует: ${sourceAbsolute}`);
    } catch (error) {
      logger.error(`[ContentBlockService] Исходный файл не найден: ${sourceAbsolute}`, error);
      throw ApiError.BadRequest(`Исходный файл не найден: ${tempPath}`);
    }
    
    // Перемещаем файл
    try {
      await fs.rename(sourceAbsolute, targetAbsolute);
      logger.debug(`[ContentBlockService] Файл успешно перемещен`);
    } catch (error) {
      logger.error(`[ContentBlockService] Ошибка при перемещении файла:`, error);
      
      // Альтернатива: копировать и удалить оригинал
      try {
        await fs.copyFile(sourceAbsolute, targetAbsolute);
        await fs.unlink(sourceAbsolute);
        logger.debug(`[ContentBlockService] Файл скопирован и оригинал удален`);
      } catch (copyError) {
        logger.error(`[ContentBlockService] Ошибка при копировании файла:`, copyError);
        throw ApiError.InternalError(`Ошибка при перемещении файла: ${copyError.message}`);
      }
    }
    
    return newWebPath;
  }

  // Удаление старого изображения
  async deleteOldImage(imageUrl) {
    try {
      if (imageUrl && imageUrl.startsWith('/uploads/content-blocks/')) {
        await fileService.deleteFile(imageUrl);
        logger.debug(`[ContentBlockService] Old image deleted: ${imageUrl}`);
      }
    } catch (err) {
      logger.warn(`[ContentBlockService] Error deleting old image ${imageUrl}: ${err.message}`);
      // Не прерываем выполнение если не удалось удалить файл
    }
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
          'contentBlocks:all',
          'contentBlocks:active',
          'contentBlocks:tag:*'
        );
        
        return true;
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    } catch (err) {
      logger.error(`[ContentBlockService] Error updating positions: ${err.message}`);
      throw err;
    }
  }
}

module.exports = ContentBlockService;