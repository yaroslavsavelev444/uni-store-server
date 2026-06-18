//@ts-nocheck
import { create } from "xmlbuilder2";
import config from "../config/feed.config.js";
import logger from "../logger/logger.js";
import { CategoryModel, ProductModel } from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type { ICategory } from "../types/category.types.js";
import type { ProductDocument } from "../types/product.types.js";
import { ProductStatus } from "../types/product.types.js";

interface YmlFeedOptions {
  useCache?: boolean;
  pretty?: boolean;
}

class YmlFeedService {
  private readonly CACHE_KEY = "yandex_feed_xml";
  private readonly DEFAULT_OPTIONS: Required<YmlFeedOptions> = {
    useCache: true,
    pretty: false,
  };

  private formatYmlDate(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  async generateYandexFeed(options?: YmlFeedOptions): Promise<string> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    if (opts.useCache) {
      try {
        const cached = await redisClient.get(this.CACHE_KEY);
        if (cached) {
          logger.info("YML feed served from Redis cache");
          return cached;
        }
      } catch (error) {
        logger.warn({
          message: "Cache get error",
          error: (error as Error).message,
        });
      }
    }

    const startTime = Date.now();
    logger.info("Starting YML feed generation");

    try {
      // 1. Получаем категории
      const categories = await this.getCategories();

      // Создаём маппинг MongoID → числовой ID (1,2,3,…)
      // В будущем можно заменить на постоянное поле feedId в БД
      const categoryMap = new Map<string, number>();
      categories.forEach((cat, index) => {
        categoryMap.set(cat._id.toString(), index + 1);
      });

      // 2. Инициализируем XML
      const xml = create({ version: "1.0", encoding: "UTF-8" });
      const yml = xml.ele("yml_catalog", {
        date: this.formatYmlDate(),
      });

      const shop = yml.ele("shop");

      shop.ele("name").txt(config.SHOP_NAME);
      shop.ele("company").txt(config.SHOP_COMPANY);
      shop.ele("url").txt(config.SHOP_URL);

      const currencies = shop.ele("currencies");
      currencies.ele("currency", { id: "RUB", rate: "1" });

      // 3. Категории – используем числовые ID из маппинга
      const categoriesElem = shop.ele("categories");
      for (const cat of categories) {
        const feedId = categoryMap.get(cat._id.toString());
        if (!feedId) {
          logger.warn(
            `Category ${cat._id} (${cat.name}) has no feed ID, skipping`,
          );
          continue;
        }
        const catAttrs: Record<string, string> = { id: String(feedId) };
        // parentId тоже маппим, если есть
        if ("parentId" in cat && cat.parentId) {
          const parentFeedId = categoryMap.get(cat.parentId.toString());
          if (parentFeedId) {
            catAttrs.parentId = String(parentFeedId);
          }
          // если родитель не найден – не добавляем parentId
        }
        categoriesElem.ele("category", catAttrs).txt(cat.name);
      }

      // 4. Офферы
      const offersElem = shop.ele("offers");
      let totalProcessed = 0;
      let lastId: string | null = null;

      while (true) {
        const { products, nextCursor } = await this.getProductsBatch(
          lastId,
          config.FEED_BATCH_SIZE,
        );

        for (const product of products) {
          const offerBuilt = this.buildOfferElement(
            offersElem,
            product,
            categoryMap,
          );
          if (offerBuilt) totalProcessed++;
        }

        if (!nextCursor) break;
        lastId = nextCursor;
      }

      const xmlString = xml.end({ prettyPrint: opts.pretty });
      const duration = Date.now() - startTime;

      logger.info(
        `YML feed generated successfully. Total offers: ${totalProcessed}, duration: ${duration}ms`,
      );

      if (opts.useCache) {
        const ttlSeconds = Number(config.CACHE_TTL_SECONDS);
        if (!isNaN(ttlSeconds) && ttlSeconds > 0) {
          await redisClient
            .setex(this.CACHE_KEY, ttlSeconds, xmlString)
            .catch((err) => {
              logger.warn("Failed to save feed to Redis cache", err);
            });
        }
      }

      return xmlString;
    } catch (error) {
      logger.error("Failed to generate YML feed", error);
      throw new Error("YML feed generation failed");
    }
  }

  private async getCategories(): Promise<ICategory[]> {
    const categories = await CategoryModel.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .lean<ICategory[]>();
    return categories;
  }

  private async getProductsBatch(
    afterId: string | null,
    limit: number,
  ): Promise<{ products: ProductDocument[]; nextCursor: string | null }> {
    const query = ProductModel.find({
      isVisible: true,
      status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
    });

    if (afterId) {
      query.where("_id").gt(afterId);
    }

    const products = await query
      .sort({ _id: 1 })
      .limit(limit + 1)
      .populate({
        path: "category",
        select: "_id name slug",
        match: { isActive: true },
      })
      .populate({
        path: "images",
        select: "url originalName",
      })
      .lean<ProductDocument[]>();

    let nextCursor: string | null = null;
    let results = products;
    if (products.length > limit) {
      results = products.slice(0, limit);
      const last = results[results.length - 1];
      nextCursor = last._id.toString();
    }

    // Отфильтровываем товары без категории или без _id
    const validProducts = results.filter(
      (p) => p.category && (p.category as any)._id,
    );

    const skipped = results.length - validProducts.length;
    if (skipped > 0) {
      logger.warn(
        `Skipped ${skipped} products due to missing or invalid category`,
      );
    }

    return { products: validProducts, nextCursor };
  }

  /**
   * Построение XML элемента offer для одного товара.
   * Проверка категории выполняется ДО создания offer.
   */
  private buildOfferElement(
    parentElem: any,
    product: ProductDocument,
    categoryMap: Map<string, number>,
  ): any | null {
    try {
      // ---- Проверяем категорию до создания offer ----
      const categoryId = (product.category as any)?._id?.toString();
      if (!categoryId) {
        logger.warn(`Product ${product.sku} has no category – skipping`);
        return null;
      }
      const feedCategoryId = categoryMap.get(categoryId);
      if (!feedCategoryId) {
        logger.warn(
          `Product ${product.sku} category ${categoryId} not found in map – skipping`,
        );
        return null;
      }

      // ---- Теперь можно создавать offer ----
      const finalPrice = this.calculateFinalPrice(product);
      if (finalPrice <= 0) {
        logger.warn(`Product ${product.sku} has invalid price, skipping`);
        return null;
      }

      const isAvailable =
        product.isVisible &&
        (product.status === ProductStatus.AVAILABLE ||
          product.status === ProductStatus.PREORDER);

      const offer = parentElem.ele("offer", {
        id: product.sku,
        type: "vendor.model",
        available: isAvailable ? "true" : "false",
      });

      const categoryName = (product.category as any)?.name;
      const typePrefix = config.MANUFACTURER ?? categoryName ?? "Товар";
      offer.ele("typePrefix").txt(typePrefix);
      offer.ele("model").txt(product.title);
      offer.ele("vendor").txt(config.MANUFACTURER);

      const categorySlug = (product.category as any)?.slug;
      const productUrl = categorySlug
        ? `${config.BASE_URL}/categories/${categorySlug}/products/${product.sku}`
        : `${config.BASE_URL}/products/${product.sku}`;
      offer.ele("url").txt(productUrl);

      const basePrice = product.priceForIndividual;
      const hasDiscount = finalPrice < basePrice;
      offer.ele("price").txt(finalPrice.toFixed(2));
      if (hasDiscount) {
        offer.ele("oldprice").txt(basePrice.toFixed(2));
      }
      offer.ele("currencyId").txt("RUB");

      // categoryId – используем числовой ID из маппинга
      offer.ele("categoryId").txt(String(feedCategoryId));

      if (product.sku) {
        offer.ele("vendorCode").txt(product.sku);
      }

      if (product.images && Array.isArray(product.images)) {
        const imagesToUse = product.images.slice(0, 10);
        for (const image of imagesToUse) {
          const imageUrl = this.getFullImageUrl((image as any)?.url);
          if (imageUrl) {
            offer.ele("picture").txt(imageUrl);
          }
        }
      }

      if (product.description) {
        const description = this.cleanDescription(product.description);
        offer.ele("description").cdata(description);
      }

      if (product.specifications?.length) {
        for (const spec of product.specifications) {
          if (spec.isVisible === false) continue;
          if (!spec.name || spec.value === undefined) continue;
          const param = offer.ele("param", { name: spec.name });
          if (spec.unit) param.att("unit", spec.unit);
          param.txt(String(spec.value));
        }
      }

      const barcode = this.extractBarcode(product);
      if (barcode) offer.ele("barcode").txt(barcode);

      offer.ele("store").txt("true");
      offer.ele("pickup").txt("true");
      offer.ele("delivery").txt("true");

      const deliveryOptions = offer.ele("delivery-options");
      deliveryOptions.ele("option", {
        cost: config.DELIVERY_COST,
        days: config.DELIVERY_DAYS,
        "order-before": config.DELIVERY_ORDER_BEFORE,
      });

      const pickupOptions = offer.ele("pickup-options");
      pickupOptions.ele("option", {
        cost: config.PICKUP_COST,
        days: config.PICKUP_DAYS,
      });

      if (product.minOrderQuantity && product.minOrderQuantity > 1) {
        offer
          .ele("sales_notes")
          .txt(`Минимальный заказ: ${product.minOrderQuantity} шт.`);
      }

      if (product.warrantyMonths && product.warrantyMonths > 0) {
        offer.ele("manufacturer_warranty").txt("true");
      }

      if (product.weight && product.weight > 0) {
        offer.ele("weight").txt(product.weight.toString());
      }

      if (product.dimensions) {
        const { length, width, height } = product.dimensions;
        if (length != null && width != null && height != null) {
          offer.ele("dimensions").txt(`${length}/${width}/${height}`);
        }
      }

      return offer;
    } catch (error) {
      logger.error(`Failed to build offer for product ${product.sku}`, error);
      return null;
    }
  }

  private calculateFinalPrice(product: ProductDocument): number {
    const basePrice = product.priceForIndividual;
    if (!product.discount?.isActive) return basePrice;

    const now = new Date();
    const validFrom = product.discount.validFrom
      ? new Date(product.discount.validFrom)
      : null;
    const validUntil = product.discount.validUntil
      ? new Date(product.discount.validUntil)
      : null;

    if (validFrom && now < validFrom) return basePrice;
    if (validUntil && now > validUntil) return basePrice;

    let finalPrice = basePrice;
    if (product.discount.percentage && product.discount.percentage > 0) {
      finalPrice *= 1 - product.discount.percentage / 100;
    }
    if (product.discount.amount && product.discount.amount > 0) {
      finalPrice = Math.max(0, finalPrice - product.discount.amount);
    }

    return finalPrice;
  }

  private getFullImageUrl(url?: string): string | null {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${config.BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
  }

  private cleanDescription(description: string): string {
    let clean = description
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n");
    clean = clean.replace(/<[^>]+>/g, "");
    clean = clean.replace(/\n\s*\n/g, "\n");
    return clean.trim();
  }

  private extractBarcode(product: ProductDocument): string | null {
    if (
      product.customAttributes &&
      typeof product.customAttributes === "object"
    ) {
      const attrs = product.customAttributes;
      const barcode =
        attrs.barcode || attrs.upc || attrs.ean || attrs.gtin || attrs.isbn;
      if (barcode) return String(barcode);
    }
    return null;
  }
}

export default new YmlFeedService();
