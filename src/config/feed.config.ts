// config/feed.config.ts
import dotenv from "dotenv";

dotenv.config();

export default {
  // Магазин
  SHOP_NAME: "НПО ПОЛЕТ",
  SHOP_COMPANY: 'ООО "НПО ПОЛЕТ"',
  SHOP_URL: "https://npo-polet.ru",
  BASE_URL: "https://npo-polet.ru",
  MANUFACTURER: 'ООО "НПО ПОЛЕТ"',
  // Настройки фида
  FEED_BATCH_SIZE: parseInt(process.env.FEED_BATCH_SIZE || "200", 10),
  CACHE_TTL_SECONDS: parseInt(process.env.CACHE_TTL_SECONDS || "3600", 10), // 1 час

  // Доставка
  DELIVERY_COST: process.env.DELIVERY_COST || "300",
  DELIVERY_DAYS: process.env.DELIVERY_DAYS || "1",
  DELIVERY_ORDER_BEFORE: process.env.DELIVERY_ORDER_BEFORE || "18",

  // Самовывоз
  PICKUP_COST: process.env.PICKUP_COST || "0",
  PICKUP_DAYS: process.env.PICKUP_DAYS || "0",
};
