/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
/** biome-ignore-all lint/style/useNodejsImportProtocol: <explanation> */
/** biome-ignore-all lint/correctness/noVoidTypeReturn: <explanation> */
import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import sanitize from "sanitize-filename";
import logger from "../logger/logger.js";
import type {
  MulterMiddlewareOptions,
  UploadRequest,
} from "../types/upload.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/data/uploads";

const ensureDirExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`[UPLOAD INIT] Папка создана: ${dirPath}`);
  }
};

// Фильтр только для изображений
const fileFilterImagesOnly = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

  if (ALLOWED_MIME.includes(mime) && ALLOWED_EXT.includes(ext)) {
    return cb(null, true);
  }

  logger.warn(
    `[UPLOAD BLOCKED] Недопустимый файл: ${file.originalname} (${mime})`,
  );
  cb(new Error("Недопустимый тип файла. Разрешены только изображения."));
};

/**
 * Универсальный multer middleware
 */
const multerMiddleware = ({
  fields,
  uploadDir = "", // поддиректория (если нужна)
  maxFileSizeMB = 60,
  maxFiles = 10,
  imagesOnly = true,
  useTemp = true,
}: MulterMiddlewareOptions) => {
  const actualUploadDir = useTemp
    ? path.join(UPLOAD_DIR, "temp")
    : path.join(UPLOAD_DIR, uploadDir || "uploads");

  ensureDirExists(actualUploadDir);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, actualUploadDir);
    },
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
    limits: {
      fileSize: maxFileSizeMB * 1024 * 1024,
    },
  });

  let multerHandler: any;

  if (typeof fields === "string") {
    multerHandler = upload.array(fields, maxFiles);
  } else if (Array.isArray(fields)) {
    const fieldArray = fields.map((fieldName) => ({
      name: fieldName,
      maxCount: maxFiles,
    }));
    multerHandler = upload.fields(fieldArray);
  } else {
    throw new Error('Параметр "fields" должен быть строкой или массивом строк');
  }

  return (req: UploadRequest, res: Response, next: NextFunction): void => {
    multerHandler(req, res, (err: any) => {
      if (err) {
        logger.error(`[UPLOAD ERROR] ${err.message}`);
        return next(err);
      }

      // Нормализация загруженных файлов
      if (req.file) {
        req.uploadedFiles = [req.file];
      } else if (Array.isArray(req.files)) {
        req.uploadedFiles = req.files;
      } else if (req.files && typeof req.files === "object") {
        // для upload.fields()
        req.uploadedFiles = Object.values(req.files).flat();
      } else {
        req.uploadedFiles = [];
      }

      logger.info(
        `[UPLOAD SUCCESS] Загружено файлов: ${req.uploadedFiles?.length || 0}`,
      );
      next();
    });
  };
};

export default multerMiddleware;
