// src/services/sitemapService.js

import {
  CategoryModel,
  ProductModel,
  TopicModelCommon,
} from "../models/index.models";
import { ProductStatus } from "../models/product-model";
import { del, get, setex } from "../redis/redis.client";

const SITEMAP_KEY = "sitemap:xml:v1";
const SITEMAP_TTL_SECONDS = 60 * 60 * 24; // 24 часа

const SITE_URL = "https://npo-polet.ru";

export async function getXml() {
  // 1️⃣ Пытаемся взять из Redis
  try {
    const cachedXml = await get(SITEMAP_KEY);
    if (cachedXml) {
      return cachedXml;
    }
  } catch (err) {
    // Redis недоступен — идём дальше
  }

  // 2️⃣ Генерируем sitemap
  const [products, categories, topics] = await Promise.all([
    ProductModel.find({ status: ProductStatus.AVAILABLE })
      .select("slug updatedAt category")
      .populate("category", "slug"), // Получаем slug категории
    CategoryModel.find({ isActive: true }).select("slug updatedAt"),
    TopicModelCommon.find({}).select("slug updatedAt"),
  ]);

  const urls = [];

  urls.push(buildUrl("/", "daily", 1.0));

  categories.forEach((c) => {
    // Изменено: /categories/{slug} вместо /catalog/{slug}
    urls.push(buildUrl(`/categories/${c.slug}`, "weekly", 0.8, c.updatedAt));
  });

  products.forEach((p) => {
    // Проверяем, есть ли категория у продукта
    if (p.category && p.category.slug) {
      // Изменено: /categories/{category-slug}/products/{product-slug}
      urls.push(
        buildUrl(
          `/categories/${p.category.slug}/products/${p.slug}`,
          "weekly",
          0.7,
          p.updatedAt,
        ),
      );
    } else {
      // Fallback на старый формат если категория не найдена
      console.warn(`Product ${p.slug} has no category, using fallback URL`);
      urls.push(buildUrl(`/product/${p.slug}`, "weekly", 0.7, p.updatedAt));
    }
  });

  topics.forEach((t) => {
    urls.push(buildUrl(`/topics/${t.slug}`, "monthly", 0.5, t.updatedAt));
  });

  const xml = buildXml(urls);

  // 3️⃣ Кладём в Redis
  try {
    await setex(SITEMAP_KEY, SITEMAP_TTL_SECONDS, xml);
  } catch (err) {
    // Ошибка кеша не ломает ответ
  }

  return xml;
}

// 🔥 Вызывать при create/update/delete товара, категории и т.д.
export async function invalidate() {
  try {
    await del(SITEMAP_KEY);
  } catch (err) {
    // noop
  }
}

function buildUrl(path, freq, priority, lastmod) {
  return {
    loc: `${SITE_URL}${path}`,
    changefreq: freq,
    priority,
    lastmod: lastmod ? lastmod.toISOString().split("T")[0] : null,
  };
}

function buildXml(urls) {
  const body = urls
    .map((u) => {
      return `
  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
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
