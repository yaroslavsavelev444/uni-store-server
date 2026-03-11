import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, extname, join } from "node:path";
import multer, { diskStorage } from "multer";
import sanitize from "sanitize-filename";
import logger from "../logger/logger";

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const ensureDirExists = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    logger.info(`[UPLOAD INIT] Папка создана: ${dirPath}`);
  } catch (error) {
    logger.error(`[UPLOAD INIT] Ошибка создания папки: ${error.message}`);
  }
};

// Базовая проверка (без сигнатур)
const fileFilterBasic = (req, file, cb) => {
  const ext = extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (!ALLOWED_MIME.includes(mime) || !ALLOWED_EXTENSIONS.includes(ext)) {
    logger.warn(`[UPLOAD BLOCKED] MIME: ${mime}, EXT: ${ext} — отклонено`);
    return cb(new Error("Недопустимый тип файла (только изображения)"));
  }
  cb(null, true);
};

const multerMiddleware = ({
  fields,
  uploadDir = "",
  maxFileSizeMB = 5,
  maxFiles = 5,
  imagesOnly = true,
  useTemp = true,
}) => {
  const baseUploadsDir = join(process.cwd(), "uploads"); // Или /var/app/uploads для продакшена
  const targetDir = join(baseUploadsDir, uploadDir);
  const actualUploadDir = useTemp ? join(targetDir, "temp") : targetDir;
  ensureDirExists(actualUploadDir);

  const storage = diskStorage({
    destination: (_, __, cb) => cb(null, actualUploadDir),
    filename: (_, file, cb) => {
      const uniqueId = randomUUID();
      const ext = extname(file.originalname).toLowerCase() || ".bin";
      const safeName = sanitize(basename(file.originalname, ext));
      const timestamp = Date.now();
      const newFilename = `${safeName}-${timestamp}-${uniqueId.substring(0, 8)}${ext}`;
      logger.info(
        `[UPLOAD] Переименование: ${file.originalname} -> ${newFilename}`,
      );
      cb(null, newFilename);
    },
  });

  const upload = multer({
    storage,
    fileFilter: imagesOnly ? fileFilterBasic : null,
    limits: { fileSize: maxFileSizeMB * 1024 * 1024 },
  });

  let multerHandler;
  if (typeof fields === "string") {
    multerHandler = upload.array(fields, maxFiles);
  } else if (Array.isArray(fields)) {
    const fieldArray = fields.map((name) => ({ name, maxCount: maxFiles }));
    multerHandler = upload.fields(fieldArray);
  } else {
    throw new Error('Поле "fields" должно быть строкой или массивом');
  }

  return (req, res, next) => {
    multerHandler(req, res, (err) => {
      if (err) {
        logger.error(`[UPLOAD ERROR] ${err.message}`);
        return next(err);
      }
      let uploadedFiles = [];
      if (req.files) {
        if (Array.isArray(req.files)) {
          uploadedFiles = req.files;
        } else {
          Object.values(req.files).forEach((arr) => uploadedFiles.push(...arr));
        }
      } else if (req.file) {
        uploadedFiles = [req.file];
      }
      req.uploadedFiles = uploadedFiles;
      logger.info(`[UPLOAD SUCCESS] Загружено файлов: ${uploadedFiles.length}`);
      next();
    });
  };
};

export default multerMiddleware;
