const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitize = require('sanitize-filename');
const logger = require('../logger/logger');

// Разрешённые расширения и MIME
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Создание директории, если её нет
const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`[UPLOAD INIT] Папка создана: ${dirPath}`);
  }
};

// Фильтрация файлов: изображения с корректным расширением и MIME
const fileFilterImagesOnly = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  logger.info(`[UPLOAD LOG] Проверка файла: ${file.originalname}, MIME: ${mime}, EXT: ${ext}`);

  const isMimeValid = ALLOWED_MIME.includes(mime);
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

  if (isMimeValid && isExtValid) {
    return cb(null, true);
  }

  logger.warn(`[UPLOAD BLOCKED] MIME: ${mime}, EXT: ${ext} — отклонено`);
  return cb(new Error('Недопустимый тип файла (только изображения)'));
};

/**
 * Универсальный multer middleware
 * @param {Object} options - Опции
 * @param {string|string[]} options.fields - Поле или поля formData
 * @param {string} options.uploadDir - Папка (относительно /uploads) для хранения
 * @param {number} [options.maxFileSizeMB=5] - Максимальный размер файла (МБ)
 * @param {number} [options.maxFiles=5] - Максимальное количество файлов
 * @param {boolean} [options.imagesOnly=true] - Разрешены ли только изображения
 * @param {boolean} [options.useTemp=true] - Кладём ли сначала в uploadDir/temp
 * @returns {function} - Express middleware
 */
const multerMiddleware = ({
  fields,
    uploadDir = '',  
  maxFileSizeMB = 5,
  maxFiles = 5,
  imagesOnly = true,
  useTemp = true,
}) => {
  // Жёстко ограничим загрузку только в /uploads
  // const baseUploadsDir = path.join(__dirname, '..', 'uploads');
  const baseUploadsDir = path.join(process.cwd(), 'uploads');
  const targetDir = path.join(baseUploadsDir, uploadDir);
  const actualUploadDir = useTemp ? path.join(targetDir, 'temp') : targetDir;

  // Создаём директорию
  ensureDirExists(actualUploadDir);

  const storage = multer.diskStorage({
    destination: (_, __, cb) => {
      cb(null, actualUploadDir);
    },
    filename: (_, file, cb) => {
      const safeName = sanitize(file.originalname);
      const ext = path.extname(safeName).toLowerCase() || '.bin';
      const name = path.basename(safeName, ext);
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
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

  let multerHandler;
  if (typeof fields === 'string') {
    multerHandler = upload.array(fields, maxFiles);
  } else if (Array.isArray(fields)) {
    const fieldArray = fields.map((fieldName) => ({ name: fieldName, maxCount: maxFiles }));
    multerHandler = upload.fields(fieldArray);
  } else {
    throw new Error('Поле "fields" должно быть строкой или массивом строк');
  }

  // Вернём обёртку middleware с логированием и загрузкой в req.uploadedFiles
  return (req, res, next) => {
    multerHandler(req, res, (err) => {
      if (err) {
        logger.error(`[UPLOAD ERROR] ${err.message}`);
        return next(err);
      }
      req.uploadedFiles = req.files || req.file || null;
      console.log('req.uploadedFiles', req.uploadedFiles);
      logger.info(`[UPLOAD SUCCESS] Файлы успешно загружены`);
      next();
    });
  };
};

module.exports = multerMiddleware;