//@ts-nocheck
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import logger from "../logger/logger.js";
import { FileModel } from "../models/index.models.js";

const UPLOAD_DIR = "/var/data/uploads";

const CONFIG = {
  maxWidth: 2048,
  maxHeight: 2048,
  jpegQuality: 82,
  webpQuality: 80,
  pngCompression: 8,
  minFileSizeForProcessing: 10 * 1024, // 10 KB
  minSavingsPercent: 3, // снижено до 3%
  concurrency: 8,
  batchSize: 100,
};

function getOutputFormat(mimeType: string): "jpeg" | "png" | "webp" | "gif" {
  const mime = mimeType.toLowerCase();
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  return "jpeg";
}

async function optimizeSingleImage(
  fullPath: string,
  mimeType: string,
): Promise<{ newSize: number; success: boolean }> {
  const tempPath = `${fullPath}.tmp`;

  try {
    const format = getOutputFormat(mimeType);
    if (format === "gif") {
      return { newSize: 0, success: false };
    }

    let pipeline = sharp(fullPath)
      .resize(CONFIG.maxWidth, CONFIG.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .withMetadata(false); // убираем EXIF

    if (format === "jpeg") {
      pipeline = pipeline.jpeg({ quality: CONFIG.jpegQuality, mozjpeg: true });
    } else if (format === "png") {
      pipeline = pipeline.png({
        compressionLevel: CONFIG.pngCompression,
        adaptiveFiltering: true,
      });
    } else if (format === "webp") {
      pipeline = pipeline.webp({ quality: CONFIG.webpQuality });
    }

    await pipeline.toFile(tempPath);

    const { size: newSize } = await fs.stat(tempPath);
    return { newSize, success: true };
  } catch (err) {
    logger.error(`[OPTIMIZE] Ошибка обработки ${fullPath}`, err);
    await fs.unlink(tempPath).catch(() => {});
    return { newSize: 0, success: false };
  }
}

async function optimizeImages() {
  logger.info("🚀 Запуск оптимизации существующих изображений...");

  let processed = 0;
  let savedBytes = 0;
  let skipped = 0;
  let errors = 0;

  const cursor = FileModel.find(
    { mimeType: { $regex: /^image\// }, deletedAt: null },
    { _id: 1, storagePath: 1, originalName: 1, mimeType: 1, sizeBytes: 1 },
  ).cursor();

  let batch: any[] = [];

  for await (const file of cursor) {
    batch.push(file);

    if (batch.length >= CONFIG.batchSize) {
      const result = await processBatch(batch);
      processed += result.processed;
      savedBytes += result.savedBytes;
      skipped += result.skipped;
      errors += result.errors;
      batch = [];
    }
  }

  // Последний батч
  if (batch.length) {
    const result = await processBatch(batch);
    processed += result.processed;
    savedBytes += result.savedBytes;
    skipped += result.skipped;
    errors += result.errors;
  }

  logger.info(`✅ Оптимизация завершена!
    Обработано: ${processed}
    Сэкономлено: ${(savedBytes / 1024 / 1024).toFixed(2)} MB
    Пропущено: ${skipped}
    Ошибок: ${errors}`);
}

// Выделяем в отдельную функцию для чистоты
async function processBatch(files: any[]) {
  let processed = 0;
  let savedBytes = 0;
  let skipped = 0;
  let errors = 0;

  // Обрабатываем с ограничением параллелизма
  const promises = files.map(async (file) => {
    const fullPath = path.join(UPLOAD_DIR, file.storagePath);
    const originalSize = file.sizeBytes || 0;

    if (originalSize < CONFIG.minFileSizeForProcessing) {
      skipped++;
      return;
    }

    const result = await optimizeSingleImage(fullPath, file.mimeType);
    if (!result.success) {
      errors++;
      return;
    }

    const savingsPercent =
      ((originalSize - result.newSize) / originalSize) * 100;

    if (savingsPercent >= CONFIG.minSavingsPercent) {
      try {
        await fs.rename(`${fullPath}.tmp`, fullPath);
        await FileModel.updateOne(
          { _id: file._id },
          { sizeBytes: result.newSize },
        );

        savedBytes += originalSize - result.newSize;
        processed++;

        logger.info(
          `✅ ${file.originalName} | -${savingsPercent.toFixed(1)}% | ${Math.round((originalSize - result.newSize) / 1024)} KB`,
        );
      } catch (err) {
        logger.error(
          `❌ Не удалось применить изменения для ${file.originalName}`,
          err,
        );
        await fs.unlink(`${fullPath}.tmp`).catch(() => {});
        errors++;
      }
    } else {
      await fs.unlink(`${fullPath}.tmp`).catch(() => {});
      skipped++;
    }
  });

  await Promise.all(promises);

  return { processed, savedBytes, skipped, errors };
}

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("🛑 Получен SIGINT. Завершаем работу...");
  process.exit(0);
});

optimizeImages().catch((err) => {
  logger.error("Критическая ошибка при оптимизации", err);
  process.exit(1);
});
