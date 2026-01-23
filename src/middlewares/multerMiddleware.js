const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto"); // Добавлен импорт
const sanitize = require("sanitize-filename");
const logger = require("../logger/logger");

// Разрешённые расширения и MIME (вынести в config)
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Создание директории
const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`[UPLOAD INIT] Папка создана: ${dirPath}`);
  }
};

// Фильтр для изображений
const fileFilterImagesOnly = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  logger.info(`[UPLOAD LOG] Проверка файла: ${file.originalname}, MIME: ${mime}, EXT: ${ext}`);
  if (ALLOWED_MIME.includes(mime) && ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(null, true);
  }
  logger.warn(`[UPLOAD BLOCKED] MIME: ${mime}, EXT: ${ext} — отклонено`);
  return cb(new Error("Недопустимый тип файла (только изображения)"));
};

/**
 * Универсальный multer middleware
 * @param {Object} options
 * @returns {function} Express middleware
 */
const multerMiddleware = ({
  fields,
  uploadDir = "",
  maxFileSizeMB = 5,
  maxFiles = 5,
  imagesOnly = true,
  useTemp = true,
}) => {
  const baseUploadsDir = path.join(process.cwd(), "uploads");
  const targetDir = path.join(baseUploadsDir, uploadDir);
  const actualUploadDir = useTemp ? path.join(targetDir, "temp") : targetDir;
  ensureDirExists(actualUploadDir);

  const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, actualUploadDir),
    filename: (_, file, cb) => {
      const uniqueId = crypto.randomUUID();
      const ext = path.extname(file.originalname).toLowerCase() || ".bin"; // Улучшено: fallback на MIME
      const safeName = sanitize(path.basename(file.originalname, ext));
      const timestamp = Date.now();
      const newFilename = `${safeName}-${timestamp}-${uniqueId.substring(0, 8)}${ext}`;
      logger.info(`[UPLOAD] Переименование: ${file.originalname} -> ${newFilename}`);
      cb(null, newFilename);
    },
  });

  const upload = multer({
    storage,
    fileFilter: imagesOnly ? fileFilterImagesOnly : null, // null вместо undefined
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
      // Унифицируем req.files в массив
      let uploadedFiles = [];
      if (req.files) {
        if (Array.isArray(req.files)) {
          uploadedFiles = req.files;
        } else {
          Object.values(req.files).forEach(arr => uploadedFiles.push(...arr));
        }
      } else if (req.file) {
        uploadedFiles = [req.file];
      }
      req.uploadedFiles = uploadedFiles;
      logger.info(`[UPLOAD SUCCESS] Файлы загружены: ${uploadedFiles.length}`);
      next();
    });
  };
};

module.exports = multerMiddleware;