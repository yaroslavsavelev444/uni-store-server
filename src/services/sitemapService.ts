// services/sitemapService.ts
import type { Redis } from "ioredis";
import {
  CategoryModel,
  ProductModel,
  TopicModelCommon,
} from "../models/index.models.js";
import redisClient from "../redis/redis.client.js";
import type { ICategory } from "../types/category.types.js";
import type { IProduct } from "../types/product.types.js";
import { ProductStatus } from "../types/product.types.js";
import type { ITopicCommon } from "../types/topicCommon.types.js";

type RedisClient = Pick<Redis, "get" | "setex" | "del">;

const redis = redisClient as unknown as RedisClient;

const SITEMAP_KEY = "sitemap:xml:v1";
const SITEMAP_TTL_SECONDS = 60 * 60 * 24; // 24 часа
const SITE_URL = "https://npo-polet.ru";

interface SitemapUrl {
  loc: string;
  changefreq: "daily" | "weekly" | "monthly";
  priority: number;
  lastmod: string | null;
}

export async function getXml(): Promise<string> {
  try {
    const cachedXml = await redis.get(SITEMAP_KEY);
    if (cachedXml) return cachedXml;
  } catch (err) {
    // Redis недоступен – идём дальше
  }

  const [products, categories, topics] = await Promise.all([
    ProductModel.find({ status: ProductStatus.AVAILABLE })
      .select("sku updatedAt category")
      .populate<{
        category: Pick<ICategory, "slug"> | null;
      }>("category", "slug")
      .lean(),
    CategoryModel.find({ isActive: true }).select("slug updatedAt").lean(),
    TopicModelCommon.find({}).select("slug updatedAt").lean(),
  ]);

  const urls: SitemapUrl[] = [];

  urls.push({
    loc: `${SITE_URL}/`,
    changefreq: "daily",
    priority: 1.0,
    lastmod: null,
  });

  for (const cat of categories) {
    urls.push({
      loc: `${SITE_URL}/categories/${cat.slug}`,
      changefreq: "weekly",
      priority: 0.8,
      lastmod: cat.updatedAt ? cat.updatedAt.toISOString().split("T")[0] : null,
    });
  }

  for (const prod of products) {
    const categorySlug = (prod.category as Pick<ICategory, "slug"> | null)
      ?.slug;
    let path: string;
    if (categorySlug) {
      path = `/categories/${categorySlug}/products/${prod.sku}`;
    } else {
      console.warn(`Product ${prod.sku} has no category, using fallback URL`);
      path = `/product/${prod.sku}`;
    }
    urls.push({
      loc: `${SITE_URL}${path}`,
      changefreq: "weekly",
      priority: 0.7,
      lastmod: prod.updatedAt
        ? prod.updatedAt.toISOString().split("T")[0]
        : null,
    });
  }

  for (const topic of topics) {
    urls.push({
      loc: `${SITE_URL}/topics/${topic.slug}`,
      changefreq: "monthly",
      priority: 0.5,
      lastmod: topic.updatedAt
        ? topic.updatedAt.toISOString().split("T")[0]
        : null,
    });
  }

  const xml = buildXml(urls);

  try {
    await redis.setex(SITEMAP_KEY, SITEMAP_TTL_SECONDS, xml);
  } catch (err) {
    // Ошибка кеша не ломает ответ
  }

  return xml;
}

export async function invalidate(): Promise<void> {
  try {
    await redis.del(SITEMAP_KEY);
  } catch (err) {
    // noop
  }
}

function buildUrl(
  path: string,
  freq: SitemapUrl["changefreq"],
  priority: number,
  lastmod?: Date,
): SitemapUrl {
  return {
    loc: `${SITE_URL}${path}`,
    changefreq: freq,
    priority,
    lastmod: lastmod ? lastmod.toISOString().split("T")[0] : null,
  };
}

function buildXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const lastmodTag = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : "";
      return `
  <url>
    <loc>${u.loc}</loc>
    ${lastmodTag}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}
