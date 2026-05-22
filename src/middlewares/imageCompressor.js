const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../logger/logger');

class ImageCompressor {
  /**
   * Основная функция сжатия изображений
   * @param {Array} files - Массив файлов из multer
   * @param {Object} options - Настройки сжатия
   * @returns {Promise<Array>} - Массив сжатых файлов
   */
  async compressImages(files, options = {}) {
    const compressedFiles = [];
    
    const compressionOptions = {
      maxWidth: options.maxWidth || 1920,       // Максимальная ширина
      maxHeight: options.maxHeight || 1080,     // Максимальная высота
      quality: options.quality || 80,          // Качество JPEG (0-100)
      webpQuality: options.webpQuality || 80,  // Качество WebP (0-100)
      convertToWebp: options.convertToWebp !== false, // Конвертировать в WebP
      ...options
    };

    for (const file of files) {
      try {
        // Проверяем, является ли файл изображением
        if (!this.isImageFile(file)) {
          compressedFiles.push(file); // Если не изображение - пропускаем
          continue;
        }

        logger.info(`[IMAGE_COMPRESSOR] Сжатие изображения: ${file.originalname}`);

        const compressedFile = await this.compressSingleImage(file, compressionOptions);
        compressedFiles.push(compressedFile);

        // Удаляем исходный временный файл
        try {
          await fs.unlink(file.path);
        } catch (err) {
          logger.warn(`Не удалось удалить временный файл: ${file.path}`);
        }

      } catch (error) {
        logger.error(`[IMAGE_COMPRESSOR] Ошибка сжатия ${file.originalname}: ${error.message}`);
        // Если ошибка сжатия, используем оригинальный файл
        compressedFiles.push(file);
      }
    }

    return compressedFiles;
  }

  /**
   * Сжатие одного изображения
   */
  async compressSingleImage(file, options) {
    const inputPath = file.path;
    const originalExt = path.extname(file.originalname).toLowerCase();
    
    // Определяем выходной формат
    const outputExt = options.convertToWebp ? '.webp' : originalExt;
    const tempName = `${path.parse(file.filename).name}${outputExt}`;
    const outputPath = path.join(path.dirname(inputPath), tempName);

    // Настройки для разных форматов
    const sharpOptions = {
      fit: sharp.fit.inside, // Сохраняем пропорции
      withoutEnlargement: true // Не увеличиваем маленькие изображения
    };

    // Инициализируем sharp
    let pipeline = sharp(inputPath)
      .resize({
        width: options.maxWidth,
        height: options.maxHeight,
        ...sharpOptions
      })
      .rotate(); // Автоповорот по EXIF

    // Применяем настройки в зависимости от формата
    if (options.convertToWebp) {
      pipeline = pipeline.webp({ 
        quality: options.webpQuality,
        effort: 4 // Баланс между скоростью и качеством (0-6)
      });
    } else if (originalExt === '.jpeg' || originalExt === '.jpg') {
      pipeline = pipeline.jpeg({ 
        quality: options.quality,
        mozjpeg: true // Используем оптимизированный MozJPEG
      });
    } else if (originalExt === '.png') {
      pipeline = pipeline.png({ 
        compressionLevel: 9, // Максимальное сжатие (0-9)
        palette: true // Уменьшаем палитру если возможно
      });
    } else if (originalExt === '.webp') {
      pipeline = pipeline.webp({ 
        quality: options.webpQuality,
        effort: 4
      });
    }

    // Выполняем сжатие
    await pipeline.toFile(outputPath);

    // Получаем метаданные сжатого файла
    const metadata = await sharp(outputPath).metadata();
    const stats = await fs.stat(outputPath);

    // Возвращаем обновленный объект файла
    return {
      ...file,
      path: outputPath,
      filename: tempName,
      size: stats.size,
      mimetype: outputExt === '.webp' ? 'image/webp' : file.mimetype
    };
  }

  /**
   * Проверяем, является ли файл изображением
   */
  isImageFile(file) {
    const imageMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/tiff',
      'image/bmp',
      'image/svg+xml'
    ];
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff', '.bmp', '.svg'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    return imageMimeTypes.includes(file.mimetype) || 
           imageExtensions.includes(fileExt);
  }

  /**
   * Middleware для Express
   */
  middleware(options = {}) {
    return async (req, res, next) => {
      try {
        // Получаем файлы из запроса
        const files = req.files || req.file || [];
        const fileArray = Array.isArray(files) ? files : [files];

        if (fileArray.length === 0) {
          return next();
        }

        // Проверяем, есть ли изображения для сжатия
        const hasImages = fileArray.some(file => this.isImageFile(file));
        
        if (!hasImages) {
          return next();
        }

        // Сжимаем изображения
        const compressedFiles = await this.compressImages(fileArray, options);
        
        // Заменяем файлы в запросе
        if (req.files) {
          req.files = compressedFiles;
        } else if (req.file) {
          req.file = compressedFiles[0];
        }

        // Также сохраняем в uploadedFiles для совместимости
        req.uploadedFiles = compressedFiles;

        logger.info(`[IMAGE_COMPRESSOR] Сжато ${compressedFiles.length} изображений`);
        next();

      } catch (error) {
        logger.error(`[IMAGE_COMPRESSOR] Ошибка middleware: ${error.message}`);
        // При ошибке пропускаем сжатие
        next();
      }
    };
  }
}

module.exports = new ImageCompressor();