/** biome-ignore-all lint/correctness/noUnusedVariables: <explanation> */
/** biome-ignore-all lint/style/useNodejsImportProtocol: <explanation> */
/** biome-ignore-all lint/correctness/noVoidTypeReturn: <explanation> */
/** biome-ignore-all lint/style/useTemplate: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import multer, { type FileFilterCallback } from "multer";
import path from "path";
import sanitize from "sanitize-filename";
import { fileURLToPath } from "url";
import logger from "../logger/logger.js";
import type {
  MulterMiddlewareOptions,
  UploadRequest,
} from "../types/upload.js";

// Эмуляция __dirname и __filename для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Разрешённые расширения и MIME
const ALLOWED_EXTENSIONS: string[] = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_MIME: string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "private_uploads");

// Создание директории, если её нет
const ensureDirExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`[UPLOAD INIT] Папка создана: ${dirPath}`);
  }
};

// Фильтрация файлов: изображения с корректным расширением и MIME
const fileFilterImagesOnly = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  logger.info(
    `[UPLOAD LOG] Проверка файла: ${file.originalname}, MIME: ${mime}, EXT: ${ext}`,
  );

  const isMimeValid = ALLOWED_MIME.includes(mime);
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

  if (isMimeValid && isExtValid) {
    return cb(null, true);
  }

  logger.warn(`[UPLOAD BLOCKED] MIME: ${mime}, EXT: ${ext} — отклонено`);
  return cb(new Error("Недопустимый тип файла (только изображения)"));
};

/**
 * Универсальный multer middleware
 * @param options - Опции
 * @returns Express middleware
 */
const multerMiddleware = ({
  fields,
  uploadDir = "",
  maxFileSizeMB = 5,
  maxFiles = 5,
  imagesOnly = true,
  useTemp = true,
}: MulterMiddlewareOptions) => {
  // Жёстко ограничим загрузку только в /uploads
  const baseUploadsDir = path.join(__dirname, "..", "uploads");
  const targetDir = path.join(baseUploadsDir, uploadDir);
  const actualUploadDir = useTemp
    ? path.join(UPLOAD_DIR, "temp")
    : path.join(UPLOAD_DIR, uploadDir);

  // Создаём директорию
  ensureDirExists(actualUploadDir);

  const storage = multer.diskStorage({
    destination: (
      _req: Request,
      _file: Express.Multer.File,
      cb: (error: Error | null, destination: string) => void,
    ) => {
      cb(null, actualUploadDir);
    },
    filename: (
      _req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, filename: string) => void,
    ) => {
      const safeName = sanitize(file.originalname);
      const ext = path.extname(safeName).toLowerCase() || ".bin";
      const name = path.basename(safeName, ext);
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
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

  // ✅ Исправлено: используем правильный тип
  let multerHandler: any; // Используем any временно, так как тип сложный

  if (typeof fields === "string") {
    multerHandler = upload.array(fields, maxFiles);
  } else if (Array.isArray(fields)) {
    const fieldArray = fields.map((fieldName: string) => ({
      name: fieldName,
      maxCount: maxFiles,
    }));
    multerHandler = upload.fields(fieldArray);
  } else {
    throw new Error('Поле "fields" должно быть строкой или массивом строк');
  }

  // Вернём обёртку middleware с логированием и загрузкой в req.uploadedFiles
  return (req: UploadRequest, res: Response, next: NextFunction): void => {
    multerHandler(req, res, (err: any) => {
      if (err) {
        logger.error(`[UPLOAD ERROR] ${err.message}`);
        return next(err);
      }

      // ✅ Нормализуем разные форматы в один
      if (req.file) {
        // Если загружен один файл (single)
        req.uploadedFiles = [req.file];
      } else if (req.files) {
        // Если загружено несколько файлов (array или fields)
        req.uploadedFiles = req.files;
      } else {
        req.uploadedFiles = null;
      }

      console.log("req.uploadedFiles", req.uploadedFiles);
      logger.info(`[UPLOAD SUCCESS] Файлы успешно загружены`);
      next();
    });
  };
};

export default multerMiddleware;
