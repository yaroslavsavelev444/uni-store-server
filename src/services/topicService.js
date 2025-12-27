const path = require("path");
const xss = require("xss");
const ApiError = require("../exceptions/api-error");
const calculateReadingTime = require("../utils/calculateReadingTime");
const { TopicModelCommon } = require("../models/index.models");
const redisClient = require("../redis/redis.client");
const logger = require("../logger/logger");

class TopicService {
  constructor() {
    this.redisClient = redisClient;
    this.CACHE_KEYS = {
      ALL_TOPICS: 'topics:all',
      TOPIC_BY_SLUG: (slug) => `topics:slug:${slug}`,
      TOPIC_BY_ID: (id) => `topics:id:${id}`,
      RELATED_TOPICS: 'topics:related'
    };
    this.CACHE_TTL = {
      ALL_TOPICS: 300, // 5 минут
      SINGLE_TOPIC: 600, // 10 минут
      RELATED: 1800 // 30 минут
    };
  }

  // Вспомогательный метод для инвалидации кеша
  async invalidateCache(...patterns) {
    try {
      for (const pattern of patterns) {
        await this.redisClient.deletePattern(pattern);
        logger.debug(`[TopicService] Invalidated cache pattern: ${pattern}`);
      }
    } catch (err) {
      logger.error(`[TopicService] Error invalidating cache: ${err.message}`);
    }
  }

  async getAll() {
    const cacheKey = this.CACHE_KEYS.ALL_TOPICS;
    
    try {
      // Пробуем получить из кеша
      const cached = await this.redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug('[TopicService] getAll from cache');
        return cached;
      }
    } catch (err) {
      logger.warn(`[TopicService] Cache get error: ${err.message}`);
    }
    
    // Получаем из базы данных
    const items = await TopicModelCommon.find({})
      .sort({ position: 1, createdAt: -1 })
      .lean();
    
    // Кешируем результат
    try {
      await this.redisClient.setJson(
        cacheKey, 
        items, 
        this.CACHE_TTL.ALL_TOPICS
      );
      logger.debug('[TopicService] getAll cached');
    } catch (err) {
      logger.warn(`[TopicService] Cache set error: ${err.message}`);
    }
    
    return items;
  }

  async getItemById(id) {
    const cacheKey = this.CACHE_KEYS.TOPIC_BY_ID(id);
    
    try {
      const cached = await this.redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[TopicService] getItemById ${id} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(`[TopicService] Cache get error: ${err.message}`);
    }
    
    const item = await TopicModelCommon.findById(id).lean();
    
    if (item) {
      try {
        await this.redisClient.setJson(
          cacheKey,
          item,
          this.CACHE_TTL.SINGLE_TOPIC
        );
        logger.debug(`[TopicService] getItemById ${id} cached`);
      } catch (err) {
        logger.warn(`[TopicService] Cache set error: ${err.message}`);
      }
    }
    
    return item;
  }

  async getBySlugWithRelated(slug) {
    const cacheKey = this.CACHE_KEYS.TOPIC_BY_SLUG(slug);
    
    try {
      const cached = await this.redisClient.getJson(cacheKey);
      if (cached) {
        logger.debug(`[TopicService] getBySlugWithRelated ${slug} from cache`);
        return cached;
      }
    } catch (err) {
      logger.warn(`[TopicService] Cache get error: ${err.message}`);
    }
    
    const item = await TopicModelCommon.findOne({ slug }).lean();
    if (!item) return null;

    // Ищем связанные записи
    const relatedTopics = await TopicModelCommon.find({
      _id: { $ne: item._id },
    })
      .select("_id slug title")
      .limit(2)
      .lean();

    const result = {
      ...item,
      relatedTopics,
    };
    
    // Кешируем результат
    try {
      await this.redisClient.setJson(
        cacheKey,
        result,
        this.CACHE_TTL.SINGLE_TOPIC
      );
      logger.debug(`[TopicService] getBySlugWithRelated ${slug} cached`);
    } catch (err) {
      logger.warn(`[TopicService] Cache set error: ${err.message}`);
    }
    
    return result;
  }

  async create(data, files) {
    const cleanTitle = xss(data.title);
    const cleanSlug = xss(data.slug);
    const cleanDescription = xss(data.description || "");
    const position = data.position || 0;

    const baseUrl = `/uploads/topics/${cleanSlug}/`;
    const coverFile = files?.cover?.[0];
    const contentImages = files?.contentImages || [];

    const imageUrl = coverFile ? path.join(baseUrl, coverFile.filename).replace(/\\/g, "/") : "";

    let parsedContentBlocks = data.contentBlocks || [];
    if (typeof parsedContentBlocks === "string") {
      try {
        parsedContentBlocks = JSON.parse(parsedContentBlocks);
      } catch {
        throw ApiError.BadRequest("Неверный формат contentBlocks");
      }
    }

    const fileMap = {};
    contentImages.forEach((file) => {
      const originalBaseName = path.basename(file.originalname);
      fileMap[originalBaseName] = path.join(baseUrl, file.filename).replace(/\\/g, "/");
    });

    const cleanAndReplaceBlock = (block) => {
      const cleanedBlock = { ...block };
      cleanedBlock.type = xss(cleanedBlock.type);

      if (cleanedBlock.type === "text" || cleanedBlock.type === "heading" || cleanedBlock.type === "highlighted") {
        cleanedBlock.value = xss(cleanedBlock.value);
      } else if (cleanedBlock.type === "image") {
        const originalName = cleanedBlock.value;
        cleanedBlock.value = fileMap[originalName] || cleanedBlock.value;
      } else if (cleanedBlock.type === "link") {
        cleanedBlock.value = {
          url: xss(cleanedBlock.value?.url || ""),
          text: xss(cleanedBlock.value?.text || ""),
        };
      } else if (cleanedBlock.type === "list") {
        if (Array.isArray(cleanedBlock.value)) {
          cleanedBlock.value = cleanedBlock.value.map((item) => xss(item));
        } else {
          cleanedBlock.value = [];
        }
      }

      return cleanedBlock;
    };

    const finalContentBlocks = parsedContentBlocks.map(cleanAndReplaceBlock);
    const readingTime = calculateReadingTime(finalContentBlocks);

    // Проверка уникальности slug
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

    // Инвалидируем кеш
    await this.invalidateCache(
      'topics:all',
      'topics:slug:*',
      'topics:related'
    );

    return newItem;
  }

  async update(id, data) {
    if (data.contentBlocks) {
      data.readingTime = calculateReadingTime(data.contentBlocks);
    }
    
    const updated = await TopicModelCommon.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
    
    if (!updated) {
      throw ApiError.BadRequest("Запись не найдена");
    }
    
    // Инвалидируем кеш
    await this.invalidateCache(
      'topics:all',
      `topics:slug:*`,
      `topics:id:${id}`,
      'topics:related'
    );
    
    return updated;
  }

  async deleteItem(id) {
    const item = await TopicModelCommon.findByIdAndDelete(id);
    
    if (!item) {
      throw ApiError.BadRequest("Запись не найдена");
    }
    
    // Инвалидируем кеш
    await this.invalidateCache(
      'topics:all',
      `topics:slug:*`,
      `topics:id:${id}`,
      'topics:related'
    );
    
    return item;
  }
}

module.exports = TopicService;