// services/TopicService.ts
import path from "node:path";
import xss from "xss";
import ApiError from "../exceptions/api-error.js";
import logger from "../logger/logger.js";
import { TopicModelCommon } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type {
  ContentBlockType,
  IContentBlock,
  ITopicCommon,
  TopicCommonDocument,
} from "../types/topicCommon.types.js";
import calculateReadingTime from "../utils/calculateReadingTime.js";

// Типизация Redis клиента с кастомными методами
interface RedisClientWithJson {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttl: number): Promise<void>;
  deletePattern(pattern: string): Promise<void>;
}

const typedRedis = redisClient as unknown as RedisClientWithJson;

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

interface CreateTopicFiles {
  cover?: MulterFile[];
  contentImages?: MulterFile[];
}

type ContentBlockValue = string | { url: string; text: string } | string[];

class TopicService {
  private readonly redisClient = typedRedis;
  private readonly CACHE_KEYS = {
    ALL_TOPICS: "topics:all",
    TOPIC_BY_SLUG: (slug: string) => `topics:slug:${slug}`,
    TOPIC_BY_ID: (id: string) => `topics:id:${id}`,
    RELATED_TOPICS: "topics:related",
  } as const;

  private readonly CACHE_TTL = {
    ALL_TOPICS: 300,
    SINGLE_TOPIC: 600,
    RELATED: 1800,
  } as const;

  private async invalidateCache(...patterns: string[]): Promise<void> {
    try {
      for (const pattern of patterns) {
        await this.redisClient.deletePattern(pattern);
        logger.debug(`[TopicService] Invalidated cache pattern: ${pattern}`);
      }
    } catch (err) {
      logger.error(
        `[TopicService] Error invalidating cache: ${(err as Error).message}`,
      );
    }
  }

  async getAll(): Promise<ITopicCommon[]> {
    const cacheKey = this.CACHE_KEYS.ALL_TOPICS;
    try {
      const cached = await this.redisClient.getJson<ITopicCommon[]>(cacheKey);
      if (cached) {
        logger.debug("[TopicService] getAll from cache");
        return cached;
      }
    } catch (err) {
      logger.warn(`[TopicService] Cache get error: ${(err as Error).message}`);
    }

    const items = await TopicModelCommon.find({})
      .sort({ position: 1, createdAt: -1 })
      .lean();
    try {
      await this.redisClient.setJson(
        cacheKey,
        items,
        this.CACHE_TTL.ALL_TOPICS,
      );
      logger.debug("[TopicService] getAll cached");
    } catch (err) {
      logger.warn(`[TopicService] Cache set error: ${(err as Error).message}`);
    }
    return items;
  }

  async getItemById(id: string): Promise<ITopicCommon | null> {
    const cacheKey = this.CACHE_KEYS.TOPIC_BY_ID(id);
    try {
      const cached = await this.redisClient.getJson<ITopicCommon>(cacheKey);
      if (cached) {
        logger.debug(`[TopicService] getItemById ${id} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(`[TopicService] Cache get error: ${(err as Error).message}`);
    }

    const item = await TopicModelCommon.findById(id).lean();
    if (item) {
      try {
        await this.redisClient.setJson(
          cacheKey,
          item,
          this.CACHE_TTL.SINGLE_TOPIC,
        );
        logger.debug(`[TopicService] getItemById ${id} cached`);
      } catch (err) {
        logger.warn(
          `[TopicService] Cache set error: ${(err as Error).message}`,
        );
      }
    }
    return item;
  }

  async getBySlugWithRelated(slug: string): Promise<
    | (ITopicCommon & {
        relatedTopics: Pick<ITopicCommon, "_id" | "slug" | "title">[];
      })
    | null
  > {
    const cacheKey = this.CACHE_KEYS.TOPIC_BY_SLUG(slug);
    try {
      const cached = await this.redisClient.getJson<
        ITopicCommon & {
          relatedTopics: Pick<ITopicCommon, "_id" | "slug" | "title">[];
        }
      >(cacheKey);
      if (cached) {
        logger.debug(`[TopicService] getBySlugWithRelated ${slug} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(`[TopicService] Cache get error: ${(err as Error).message}`);
    }

    const item = await TopicModelCommon.findOne({ slug }).lean();
    if (!item) return null;

    const relatedTopics = await TopicModelCommon.find({
      _id: { $ne: item._id },
    })
      .select("_id slug title")
      .limit(2)
      .lean();

    const result = { ...item, relatedTopics };
    try {
      await this.redisClient.setJson(
        cacheKey,
        result,
        this.CACHE_TTL.SINGLE_TOPIC,
      );
      logger.debug(`[TopicService] getBySlugWithRelated ${slug} cached`);
    } catch (err) {
      logger.warn(`[TopicService] Cache set error: ${(err as Error).message}`);
    }
    return result;
  }

  async create(
    data: Record<string, unknown>,
    files: CreateTopicFiles | undefined,
  ): Promise<ITopicCommon> {
    const cleanTitle = xss(data.title as string);
    const cleanSlug = xss(data.slug as string);
    const cleanDescription = xss((data.description as string) || "");
    const position = typeof data.position === "number" ? data.position : 0;

    const baseUrl = `/uploads/topics/${cleanSlug}/`;
    const coverFile = files?.cover?.[0];
    const contentImages = files?.contentImages || [];

    const imageUrl = coverFile
      ? path.join(baseUrl, coverFile.filename).replace(/\\/g, "/")
      : "";

    let parsedContentBlocks: unknown[] =
      (data.contentBlocks as unknown[]) || [];
    if (typeof parsedContentBlocks === "string") {
      try {
        parsedContentBlocks = JSON.parse(parsedContentBlocks);
      } catch {
        throw ApiError.BadRequest("Неверный формат contentBlocks");
      }
    }

    const fileMap: Record<string, string> = {};
    for (const file of contentImages) {
      const originalBaseName = path.basename(file.originalname);
      fileMap[originalBaseName] = path
        .join(baseUrl, file.filename)
        .replace(/\\/g, "/");
    }

    const cleanAndReplaceBlock = (
      block: Record<string, unknown>,
    ): IContentBlock => {
      const cleanedBlock: IContentBlock = {
        //@ts-expect-error
        type: xss(block.type as ContentBlockType),
        value: block.value,
      };
      if (
        cleanedBlock.type === "text" ||
        cleanedBlock.type === "heading" ||
        cleanedBlock.type === "highlighted"
      ) {
        cleanedBlock.value = xss(block.value as string);
      } else if (cleanedBlock.type === "image") {
        const originalName = block.value as string;
        cleanedBlock.value = fileMap[originalName] || originalName;
      } else if (cleanedBlock.type === "link") {
        const link = block.value as { url?: string; text?: string };
        cleanedBlock.value = {
          url: xss(link.url || ""),
          text: xss(link.text || ""),
        };
      } else if (cleanedBlock.type === "list") {
        if (Array.isArray(block.value)) {
          cleanedBlock.value = (block.value as string[]).map((item) =>
            xss(item),
          );
        } else {
          cleanedBlock.value = [];
        }
      }
      return cleanedBlock;
    };

    const finalContentBlocks = (
      parsedContentBlocks as Record<string, unknown>[]
    ).map(cleanAndReplaceBlock);
    const readingTime = calculateReadingTime(finalContentBlocks);

    const existing = await TopicModelCommon.findOne({ slug: cleanSlug });
    if (existing) {
      throw ApiError.BadRequest("Запись с таким slug уже существует");
    }

    const newItem = await TopicModelCommon.create({
      title: cleanTitle,
      slug: cleanSlug,
      description: cleanDescription,
      position,
      imageUrl,
      contentBlocks: finalContentBlocks,
      readingTime,
    });

    await this.invalidateCache("topics:all", "topics:slug:*", "topics:related");
    return newItem.toObject();
  }

  async update(id: string, data: Partial<ITopicCommon>): Promise<ITopicCommon> {
    const updateData = { ...data };
    if (data.contentBlocks) {
      updateData.readingTime = calculateReadingTime(data.contentBlocks);
    }
    const updated = await TopicModelCommon.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      throw ApiError.BadRequest("Запись не найдена");
    }
    await this.invalidateCache(
      "topics:all",
      "topics:slug:*",
      `topics:id:${id}`,
      "topics:related",
    );
    return updated.toObject();
  }

  async deleteItem(id: string): Promise<ITopicCommon> {
    const item = await TopicModelCommon.findByIdAndDelete(id);
    if (!item) {
      throw ApiError.BadRequest("Запись не найдена");
    }
    await this.invalidateCache(
      "topics:all",
      "topics:slug:*",
      `topics:id:${id}`,
      "topics:related",
    );
    return item.toObject();
  }
}

export default TopicService;
