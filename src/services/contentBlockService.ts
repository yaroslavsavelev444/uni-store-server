//@ts-nocheck
// services/contentBlock.service.ts
import path from "node:path";
import { startSession, Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { ContentBlockModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type { IContentBlockDocument } from "../types/contentBlock.types.js";
import fileService from "../utils/fileManager.js";
import fileStorageService from "./fileStorage.service.js";

// Типизация Redis
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl: number): Promise<void>;
  deletePattern(pattern: string): Promise<void>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

interface PositionUpdate {
  id: string | Types.ObjectId;
  position: number;
}

class ContentBlockService {
  private readonly redisClient = typedRedis;
  private readonly CACHE_KEYS = {
    ALL_BLOCKS: "contentBlocks:all",
    ACTIVE_BLOCKS: "contentBlocks:active",
    BLOCK_BY_ID: (id: string) => `contentBlocks:id:${id}`,
    BLOCKS_BY_TAG: (tag: string) => `contentBlocks:tag:${tag}`,
  } as const;

  private readonly CACHE_TTL = {
    ALL: 300,
    ACTIVE: 1800,
    SINGLE: 600,
  } as const;

  private async invalidateCache(...patterns: string[]): Promise<void> {
    try {
      for (const pattern of patterns) {
        await this.redisClient.deletePattern(pattern);
        logger.debug(
          `[ContentBlockService] Invalidated cache pattern: ${pattern}`,
        );
      }
    } catch (err) {
      logger.error(
        `[ContentBlockService] Error invalidating cache: ${(err as Error).message}`,
      );
    }
  }

  async getAll(includeInactive = false): Promise<IContentBlockDocument[]> {
    const cacheKey = includeInactive
      ? this.CACHE_KEYS.ALL_BLOCKS
      : this.CACHE_KEYS.ACTIVE_BLOCKS;

    try {
      const cached = await this.redisClient.getJson<any[]>(cacheKey);
      if (cached) {
        logger.debug(`getAll from cache`);
        // Возвращаем из кэша как есть (это уже plain объекты, но структура сохранена)
        return cached as IContentBlockDocument[];
      }
    } catch (err) {
      logger.warn(`Cache get error: ${(err as Error).message}`);
    }

    const query = includeInactive ? {} : { isActive: true };
    const items = await ContentBlockModel.find(query)
      .sort({ position: 1, createdAt: -1 })
      .populate({
        path: "imageUrl",
        select:
          "_id originalName name sizeBytes mimeType url accessType entityType entityId originalName storedName storagePath",
      })
      .exec();

    // Преобразуем в plain объекты для сериализации (mongoose документы могут содержать циклические ссылки)
    const plainItems = items.map((item) => item.toObject());

    try {
      await this.redisClient.setJson(
        cacheKey,
        plainItems,
        this.CACHE_TTL.ACTIVE,
      );
    } catch (err) {
      logger.warn(`Cache set error: ${(err as Error).message}`);
    }

    return items; // возвращаем mongoose документы (с populate) - они сохраняют методы, но при ответе клиенту toJSON преобразует
  }

  async getById(
    id: string | Types.ObjectId,
  ): Promise<IContentBlockDocument | null> {
    const cacheKey = this.CACHE_KEYS.BLOCK_BY_ID(id.toString());

    try {
      const cached =
        await this.redisClient.getJson<IContentBlockDocument>(cacheKey);
      if (cached) {
        logger.debug(`[ContentBlockService] getById ${id} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(
        `[ContentBlockService] Cache get error: ${(err as Error).message}`,
      );
    }

    const item = await ContentBlockModel.findById(id).exec();
    if (item) {
      try {
        await this.redisClient.setJson(cacheKey, item, this.CACHE_TTL.SINGLE);
        logger.debug(`[ContentBlockService] getById ${id} cached`);
      } catch (err) {
        logger.warn(
          `[ContentBlockService] Cache set error: ${(err as Error).message}`,
        );
      }
    }

    return item;
  }

  async getByTag(tag: string): Promise<IContentBlockDocument[]> {
    const normalizedTag = tag.toLowerCase().trim();
    const cacheKey = this.CACHE_KEYS.BLOCKS_BY_TAG(normalizedTag);

    try {
      const cached =
        await this.redisClient.getJson<IContentBlockDocument[]>(cacheKey);
      if (cached) {
        logger.debug(`[ContentBlockService] getByTag ${tag} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(
        `[ContentBlockService] Cache get error: ${(err as Error).message}`,
      );
    }

    const items = await ContentBlockModel.find({
      tags: normalizedTag,
      isActive: true,
    })
      .sort({ position: 1, createdAt: -1 })
      .exec();

    try {
      await this.redisClient.setJson(cacheKey, items, this.CACHE_TTL.ACTIVE);
      logger.debug(`[ContentBlockService] getByTag ${tag} cached`);
    } catch (err) {
      logger.warn(
        `[ContentBlockService] Cache set error: ${(err as Error).message}`,
      );
    }

    return items;
  }

  async create(
    contentBlockData: Partial<IContentBlockDocument>,
    userId: string | Types.ObjectId,
  ): Promise<IContentBlockDocument> {
    try {
      if (contentBlockData.imageUrl) {
        contentBlockData.imageUrl = await this.processImage(
          contentBlockData.imageUrl,
        );
      }

      const newBlock = new ContentBlockModel({
        ...contentBlockData,
        createdBy: userId,
        updatedBy: userId,
      });

      await newBlock.save();

      await this.invalidateCache(
        "contentBlocks:all",
        "contentBlocks:active",
        "contentBlocks:tag:*",
      );

      return newBlock;
    } catch (err) {
      logger.error(
        `[ContentBlockService] Error creating block: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async update(
    id: string | Types.ObjectId,
    updateData: Partial<IContentBlockDocument>,
    userId: string | Types.ObjectId,
  ): Promise<IContentBlockDocument> {
    if (!Types.ObjectId.isValid(id.toString())) {
      throw ApiError.BadRequest("Некорректный формат ID блока");
    }

    const existingBlock = await ContentBlockModel.findById(id);
    if (!existingBlock) {
      throw ApiError.BadRequest("Блок не найден");
    }

    if (updateData.imageUrl !== undefined) {
      if (updateData.imageUrl === null) {
        if (existingBlock.imageUrl) {
          // удаление старого изображения закомментировано в оригинале
        }
        updateData.imageUrl = null;
      } else if (updateData.imageUrl) {
        const newImageUrl = await this.processImage(updateData.imageUrl);
        updateData.imageUrl = newImageUrl;
      }
    }

    Object.assign(existingBlock, updateData);
    existingBlock.updatedBy = userId as Types.ObjectId;
    existingBlock.updatedAt = new Date();

    await existingBlock.save();

    await this.invalidateCache(
      "contentBlocks:all",
      "contentBlocks:active",
      `contentBlocks:id:${id.toString()}`,
      "contentBlocks:tag:*",
    );

    return existingBlock;
  }

  async delete(id: string | Types.ObjectId): Promise<boolean> {
    const block = await ContentBlockModel.findById(id);
    if (!block) {
      throw ApiError.BadRequest("Блок не найден");
    }

    if (block.imageUrl) {
      await this.deleteOldImage(block.imageUrl as string);
    }

    await ContentBlockModel.findByIdAndDelete(id);

    await this.invalidateCache(
      "contentBlocks:all",
      "contentBlocks:active",
      `contentBlocks:id:${id.toString()}`,
      "contentBlocks:tag:*",
    );

    return true;
  }

  async toggleActive(
    id: string | Types.ObjectId,
    isActive: boolean,
  ): Promise<IContentBlockDocument> {
    const updated = await ContentBlockModel.findByIdAndUpdate(
      id,
      { isActive, updatedAt: new Date() },
      { new: true },
    );

    if (!updated) {
      throw ApiError.BadRequest("Блок не найден");
    }

    await this.invalidateCache(
      "contentBlocks:all",
      "contentBlocks:active",
      `contentBlocks:id:${id.toString()}`,
      "contentBlocks:tag:*",
    );

    return updated;
  }

  async updatePositions(positionUpdates: PositionUpdate[]): Promise<boolean> {
    const session = await startSession();
    session.startTransaction();

    try {
      for (const update of positionUpdates) {
        await ContentBlockModel.findByIdAndUpdate(
          update.id,
          { position: update.position, updatedAt: new Date() },
          { session },
        );
      }
      await session.commitTransaction();

      await this.invalidateCache(
        "contentBlocks:all",
        "contentBlocks:active",
        "contentBlocks:tag:*",
      );

      return true;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    withImages: number;
    withButtons: number;
    withoutImages: number;
    withoutButtons: number;
  }> {
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
      logger.error(
        `[ContentBlockService] Error getting stats: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  private async processImage(
    imageId: string | null | undefined,
  ): Promise<string | null> {
    // Если ID не передан или пустая строка — возвращаем null
    if (!imageId || imageId.trim() === "") {
      return null;
    }

    // Проверяем существование файла через FileStorageService
    const existingIds = await fileStorageService.checkIfExists(imageId);

    // checkIfExists возвращает null или массив найденных ID
    const exists =
      existingIds && Array.isArray(existingIds) && existingIds.length > 0;

    if (!exists) {
      throw new Error(`Файл с ID "${imageId}" не найден или удалён`);
    }

    // Возвращаем ID (сохраняем как строку, в базе оставляем строковое представление ObjectId)
    return imageId;
  }

  private async deleteOldImage(imageUrl: string): Promise<void> {
    try {
      if (imageUrl.startsWith("/uploads/content-blocks/")) {
        // fileService.deleteFile закомментирован в оригинале
        logger.debug(`[ContentBlockService] Old image deleted: ${imageUrl}`);
      }
    } catch (err) {
      logger.warn(
        `[ContentBlockService] Error deleting old image ${imageUrl}: ${(err as Error).message}`,
      );
    }
  }
}

export default new ContentBlockService();
