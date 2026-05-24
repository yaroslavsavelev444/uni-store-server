import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import sanitize from "sanitize-filename";
import sharp from "sharp";
import logger from "../logger/logger.js";
import type {
  MulterMiddlewareOptions,
  UploadRequest,
} from "../types/upload.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/data/uploads";

const ensureDirExistsSync = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`[UPLOAD] Папка создана: ${dirPath}`);
  }
};

const COMPRESSION_CONFIG = {
  maxWidth: 2048,
  maxHeight: 2048,
  jpegQuality: 82,
  webpQuality: 80,
  pngCompression: 8,
};

// ================== ФИЛЬТР ==================
const fileFilterImagesOnly = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void => {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowed.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    logger.warn(`[UPLOAD BLOCKED] ${file.originalname} (${file.mimetype})`);
    cb(new Error("Недопустимый тип файла. Разрешены только изображения."));
  }
};

// ================== ОПТИМИЗАЦИЯ ==================
const getOutputFormat = (mimetype: string): "jpeg" | "png" | "webp" | "gif" => {
  const mime = mimetype.toLowerCase();
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  return "jpeg";
};

const optimizeImage = async (
  filePath: string,
  mimetype: string,
  enableCompression: boolean,
): Promise<number> => {
  if (!enableCompression) {
    return (await fs.promises.stat(filePath)).size;
  }

  const tempPath = `${filePath}.tmp`; // ← исправлено: template literal
  const format = getOutputFormat(mimetype);

  if (format === "gif") {
    return (await fs.promises.stat(filePath)).size;
  }

  try {
    let pipeline = sharp(filePath)
      .resize(COMPRESSION_CONFIG.maxWidth, COMPRESSION_CONFIG.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .rotate();

    // Исправлено: правильный способ убрать метаданные
    pipeline = pipeline.withMetadata(false as any); // или можно полностью убрать строку

    if (format === "jpeg") {
      pipeline = pipeline.jpeg({
        quality: COMPRESSION_CONFIG.jpegQuality,
        mozjpeg: true,
      });
    } else if (format === "webp") {
      pipeline = pipeline.webp({
        quality: COMPRESSION_CONFIG.webpQuality,
      });
    } else if (format === "png") {
      pipeline = pipeline.png({
        compressionLevel: COMPRESSION_CONFIG.pngCompression,
        adaptiveFiltering: true,
      });
    }

    await pipeline.toFile(tempPath);

    const stats = await fs.promises.stat(tempPath);
    await fs.promises.rename(tempPath, filePath);

    logger.info(
      `[SHARP] Сжато: ${path.basename(filePath)} → ${Math.round(stats.size / 1024)} KB`,
    );

    return stats.size;
  } catch (error) {
    logger.warn(`[SHARP] Ошибка сжатия ${path.basename(filePath)} → ${error}`);
    await fs.promises.unlink(tempPath).catch(() => {});
    return (await fs.promises.stat(filePath)).size;
  }
};

// ================== MIDDLEWARE ==================
const multerMiddleware = ({
  fields,
  uploadDir = "",
  maxFileSizeMB = 60,
  maxFiles = 10,
  imagesOnly = true,
  useTemp = true,
  enableCompression = true,
}: MulterMiddlewareOptions & { enableCompression?: boolean }) => {
  const actualUploadDir = useTemp
    ? path.join(UPLOAD_DIR, "temp")
    : path.join(UPLOAD_DIR, uploadDir || "uploads");

  ensureDirExistsSync(actualUploadDir);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, actualUploadDir),
    filename: (_req, file, cb) => {
      const safeName = sanitize(file.originalname);
      const ext = path.extname(safeName).toLowerCase() || ".bin";
      const name = path.basename(safeName, ext);
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${name}-${unique}${ext}`);
    },
  });

  const upload = multer({
    storage,
    fileFilter: imagesOnly ? fileFilterImagesOnly : undefined,
    limits: { fileSize: maxFileSizeMB * 1024 * 1024 },
  });

  let multerHandler: any;

  if (typeof fields === "string") {
    multerHandler = upload.array(fields, maxFiles);
  } else if (Array.isArray(fields)) {
    multerHandler = upload.fields(
      fields.map((name) => ({ name, maxCount: maxFiles })),
    );
  } else {
    throw new Error('Параметр "fields" должен быть строкой или массивом строк');
  }

  return async (req: UploadRequest, res: Response, next: NextFunction) => {
    multerHandler(req, res, async (err: any) => {
      if (err) {
        logger.error(`[UPLOAD ERROR] ${err.message}`);
        return next(err);
      }

      req.uploadedFiles = req.file
        ? [req.file]
        : Array.isArray(req.files)
          ? req.files
          : req.files && typeof req.files === "object"
            ? Object.values(req.files).flat()
            : [];

      if (req.uploadedFiles.length > 0) {
        const results = await Promise.allSettled(
          req.uploadedFiles
            .filter((file) => file.mimetype.startsWith("image/"))
            .map(async (file) => {
              const newSize = await optimizeImage(
                file.path,
                file.mimetype,
                enableCompression,
              );
              file.size = newSize;
            }),
        );

        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          logger.warn(`[SHARP] Не удалось сжать ${failed} файл(ов)`);
        }
      }

      logger.info(
        `[UPLOAD SUCCESS] Обработано файлов: ${req.uploadedFiles.length}`,
      );
      next();
    });
  };
};

export default multerMiddleware;
