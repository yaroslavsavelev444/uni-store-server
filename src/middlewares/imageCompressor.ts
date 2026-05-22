// middlewares/imageCompressor.ts
import { promises as fs } from "node:fs";
import { dirname, extname, join, parse } from "node:path";
import type { NextFunction, Request, Response } from "express";
import sharp from "sharp";
import logger from "../logger/logger.js";

// Расширенный тип для сжатого файла (добавляем все поля из Multer.File)
export interface CompressedFile extends Express.Multer.File {
  path: string;
  filename: string;
  size: number;
  mimetype: string;
}

// Настройки сжатия
interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  webpQuality?: number;
  convertToWebp?: boolean;
}

// Полные опции со значениями по умолчанию
interface ResolvedCompressionOptions extends Required<CompressionOptions> {
  // можно добавить другие поля при необходимости
}

class ImageCompressor {
  /**
   * Основная функция сжатия изображений
   * @param files - Массив файлов из multer
   * @param options - Настройки сжатия
   * @returns Массив сжатых файлов
   */
  async compressImages(
    files: Express.Multer.File[],
    options: CompressionOptions = {},
  ): Promise<CompressedFile[]> {
    const compressedFiles: CompressedFile[] = [];

    const compressionOptions: ResolvedCompressionOptions = {
      maxWidth: options.maxWidth ?? 1920,
      maxHeight: options.maxHeight ?? 1080,
      quality: options.quality ?? 80,
      webpQuality: options.webpQuality ?? 80,
      convertToWebp: options.convertToWebp !== false,
    };

    for (const file of files) {
      try {
        if (!this.isImageFile(file)) {
          // Не изображение – оставляем как есть, но нужно привести к нужному типу
          compressedFiles.push(file as CompressedFile);
          continue;
        }

        logger.info(
          `[IMAGE_COMPRESSOR] Сжатие изображения: ${file.originalname}`,
        );

        const compressedFile = await this.compressSingleImage(
          file,
          compressionOptions,
        );
        compressedFiles.push(compressedFile);

        // Удаляем исходный временный файл
        try {
          await fs.unlink(file.path);
        } catch {
          // игнорируем ошибку удаления, просто логируем предупреждение
          logger.warn(`Не удалось удалить временный файл: ${file.path}`);
        }
      } catch (error) {
        const err = error as Error;
        logger.error(
          `[IMAGE_COMPRESSOR] Ошибка сжатия ${file.originalname}: ${err.message}`,
        );
        // При ошибке используем оригинальный файл
        compressedFiles.push(file as CompressedFile);
      }
    }

    return compressedFiles;
  }

  /**
   * Сжатие одного изображения
   */
  private async compressSingleImage(
    file: Express.Multer.File,
    options: ResolvedCompressionOptions,
  ): Promise<CompressedFile> {
    const inputPath = file.path;
    const originalExt = extname(file.originalname).toLowerCase();

    const outputExt = options.convertToWebp ? ".webp" : originalExt;
    const tempName = `${parse(file.filename).name}${outputExt}`;
    const outputPath = join(dirname(inputPath), tempName);

    let pipeline = sharp(inputPath)
      .resize({
        width: options.maxWidth,
        height: options.maxHeight,
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .rotate(); // автоповорот по EXIF

    if (options.convertToWebp) {
      pipeline = pipeline.webp({
        quality: options.webpQuality,
        effort: 4,
      });
    } else if (originalExt === ".jpeg" || originalExt === ".jpg") {
      pipeline = pipeline.jpeg({
        quality: options.quality,
        mozjpeg: true,
      });
    } else if (originalExt === ".png") {
      pipeline = pipeline.png({
        compressionLevel: 9,
        palette: true,
      });
    } else if (originalExt === ".webp") {
      pipeline = pipeline.webp({
        quality: options.webpQuality,
        effort: 4,
      });
    }

    await pipeline.toFile(outputPath);

    // получаем статистику файла (metadata не используется)
    const stats = await fs.stat(outputPath);

    return {
      ...file,
      path: outputPath,
      filename: tempName,
      size: stats.size,
      mimetype: outputExt === ".webp" ? "image/webp" : file.mimetype,
    };
  }

  /**
   * Проверка, является ли файл изображением
   */
  private isImageFile(file: Express.Multer.File): boolean {
    const imageMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/tiff",
      "image/bmp",
      "image/svg+xml",
    ];

    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".tiff",
      ".bmp",
      ".svg",
    ];

    const fileExt = extname(file.originalname).toLowerCase();
    return (
      imageMimeTypes.includes(file.mimetype) ||
      imageExtensions.includes(fileExt)
    );
  }

  /**
   * Middleware для Express
   */
  middleware(options: CompressionOptions = {}) {
    return async (
      req: Request,
      _res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        const files = req.files || req.file || [];
        let fileArray: Express.Multer.File[] = [];

        // Приводим req.files (который может быть объектом или массивом) к массиву
        if (Array.isArray(files)) {
          fileArray = files;
        } else if (files && typeof files === "object") {
          // объект { fieldname: file[] }
          fileArray = Object.values(files).flat();
        } else if (req.file) {
          fileArray = [req.file];
        }

        if (fileArray.length === 0) {
          return next();
        }

        const hasImages = fileArray.some((file) => this.isImageFile(file));
        if (!hasImages) {
          return next();
        }

        const compressedFiles = await this.compressImages(fileArray, options);

        // Обновляем req.files или req.file в зависимости от того, что было
        if (req.files) {
          if (Array.isArray(req.files)) {
            req.files = compressedFiles;
          } else {
            // Если req.files был объектом, восстанавливаем структуру объекта
            const filesObj: { [fieldname: string]: CompressedFile[] } = {};
            let idx = 0;
            for (const field of Object.keys(req.files)) {
              const originalCount = (
                req.files as { [key: string]: Express.Multer.File[] }
              )[field].length;
              filesObj[field] = compressedFiles.slice(idx, idx + originalCount);
              idx += originalCount;
            }
            req.files = filesObj;
          }
        } else if (req.file) {
          req.file = compressedFiles[0];
        }

        req.uploadedFiles = compressedFiles;

        logger.info(
          `[IMAGE_COMPRESSOR] Сжато ${compressedFiles.length} изображений`,
        );
        next();
      } catch (error) {
        const err = error as Error;
        logger.error(`[IMAGE_COMPRESSOR] Ошибка middleware: ${err.message}`);
        next();
      }
    };
  }
}

// Экспортируем единственный экземпляр
export default new ImageCompressor();
