// services/fileService.js
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const logger = require("../logger/logger");
const serverConfig = require("../config/serverConfig");

class FileService {
  constructor() {
      this.uploadsDir = path.join(process.cwd(), serverConfig.uploadsDir);
    this.tempDir = path.join(this.uploadsDir, "temp");
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error(`Ошибка создания директорий: ${error.message}`);
    }
  }

  generateTempName(originalName) {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName);
    return `${timestamp}_${randomString}${extension}`;
  }

  async saveFile(userId, file) {
    // У вашего файла уже есть filename от multer
    const tempName = file.filename; // Используем уже сгенерированное имя
    const tempPath = file.path; // Используем полный путь из multer
    
    logger.info(`Файл сохранен multer: ${tempName} (${file.originalname}) по пути: ${tempPath}`);

    // Сохраняем метаданные
    const metaPath = path.join(this.tempDir, `${userId}_meta.json`);
    const fileMeta = {
      id: tempName,
      tempName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      userId,
      // Изменено: теперь возвращаем относительный путь
      path: `/uploads/temp/${tempName}`,
      // Добавлено: полный URL формируется на сервере
      url: serverConfig.getTempFileUrl(tempName),
      // Добавлено: для обратной совместимости
      relativeUrl: `/uploads/temp/${tempName}`
    };


    let existingMeta = [];
    try {
      const metaContent = await fs.readFile(metaPath, 'utf8');
      existingMeta = JSON.parse(metaContent);
    } catch (error) {
      // Файл не существует, это нормально
      logger.info(`Создаем новый файл метаданных для пользователя ${userId}`);
    }

    existingMeta.push(fileMeta);
    await fs.writeFile(metaPath, JSON.stringify(existingMeta, null, 2));

    logger.info(`Метаданные сохранены для файла: ${tempName}`);

    return fileMeta;
  }

  async saveFiles(userId, files) {
    const fileArray = Array.isArray(files) ? files : Object.values(files).flat();
    const results = [];

    for (const file of fileArray) {
      try {
        const result = await this.saveFile(userId, file);
        results.push(result);
      } catch (error) {
        logger.error(`Ошибка сохранения файла ${file.originalname}:`, error);
        // Пробрасываем ошибку дальше
        throw new Error(`Ошибка сохранения файла ${file.originalname}: ${error.message}`);
      }
    }

    return results;
  }

  async deleteFiles(tempNames) {
    const deletePromises = tempNames.map(async (tempName) => {
      try {
        const filePath = path.join(this.tempDir, tempName);
        
        // Проверяем существование файла
        try {
          await fs.access(filePath);
        } catch (error) {
          logger.warn(`Файл ${tempName} не существует, пропускаем удаление`);
          return { success: true, tempName, warning: 'Файл не существует' };
        }
        
        await fs.unlink(filePath);
        logger.info(`Файл удален: ${tempName}`);
        return { success: true, tempName };
      } catch (error) {
        logger.error(`Ошибка удаления файла ${tempName}:`, error);
        return { success: false, tempName, error: error.message };
      }
    });

    const results = await Promise.all(deletePromises);
    
    // Также очищаем метаданные
    await this.cleanupMetadata();

    return results;
  }

  async cleanupMetadata() {
    try {
      const files = await fs.readdir(this.tempDir);
      const metaFiles = files.filter(f => f.endsWith('_meta.json'));

      for (const metaFile of metaFiles) {
        const metaPath = path.join(this.tempDir, metaFile);
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const metadata = JSON.parse(metaContent);

        // Фильтруем только существующие файлы
        const filteredMetadata = [];
        for (const meta of metadata) {
          const filePath = path.join(this.tempDir, meta.tempName);
          try {
            await fs.access(filePath);
            filteredMetadata.push(meta);
          } catch (error) {
            // Файл не существует, пропускаем
            logger.info(`Файл ${meta.tempName} не существует, удаляем из метаданных`);
          }
        }

        await fs.writeFile(metaPath, JSON.stringify(filteredMetadata, null, 2));
        logger.info(`Метаданные очищены для ${metaFile}`);
      }
    } catch (error) {
      logger.error(`Ошибка очистки метаданных: ${error.message}`);
    }
  }

  async getFileInfo(tempName) {
    try {
      const metaFiles = await fs.readdir(this.tempDir);
      const metaFile = metaFiles.find(f => f.endsWith('_meta.json'));

      if (metaFile) {
        const metaPath = path.join(this.tempDir, metaFile);
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const metadata = JSON.parse(metaContent);
        
        return metadata.find(m => m.tempName === tempName);
      }
    } catch (error) {
      logger.error(`Ошибка получения информации о файле ${tempName}:`, error);
    }

    return null;
  }

  async getFilePath(tempName) {
    const filePath = path.join(this.tempDir, tempName);
    try {
      await fs.access(filePath);
      return filePath;
    } catch (error) {
      return null;
    }
  }

  enrichFilesWithFullUrls(files) {
    if (!files) return [];
    
    const arr = Array.isArray(files) ? files : [files];
    
    return arr.map(file => {
      if (!file) return null;
      
      // Если файл - строка (путь)
      if (typeof file === 'string') {
        return {
          url: serverConfig.getFileUrl(file),
          path: file,
          filename: path.basename(file)
        };
      }
      
      // Если файл - объект
      const result = { ...file };
      
      // Обновляем URL если есть path или url
      if (file.path && !file.url) {
        result.url = serverConfig.getFileUrl(file.path);
      } else if (file.url && !file.path && file.url.startsWith('/')) {
        result.path = file.url;
        result.url = serverConfig.getFileUrl(file.url);
      } else if (file.url && file.url.startsWith('http')) {
        result.path = file.url.replace(serverConfig.filesBaseUrl, '');
      }
      
      return result;
    }).filter(Boolean);
  }

  /**
   * Подготавливает файлы для ответа API
   * @param {Array|Object|string} files - файлы
   * @param {Object} options - опции
   * @returns {Array} подготовленные файлы
   */
  prepareFilesForResponse(files, options = {}) {
    const {
      includeFullUrl = true,
      includeRelativePath = true,
      includeMetadata = true
    } = options;

    if (!files) return [];
    
    const arr = Array.isArray(files) ? files : [files];
    
    return arr.map(file => {
      if (!file) return null;
      
      // Если строка
      if (typeof file === 'string') {
        const result = {};
        if (includeRelativePath) result.path = file;
        if (includeFullUrl) result.url = serverConfig.getFileUrl(file);
        if (includeMetadata) {
          result.filename = path.basename(file);
          result.extension = path.extname(file);
        }
        return result;
      }
      
      // Если объект
      const result = { ...file };
      
      // Гарантируем наличие полного URL
      if (includeFullUrl && !result.url && result.path) {
        result.url = serverConfig.getFileUrl(result.path);
      } else if (includeFullUrl && result.url && result.url.startsWith('/')) {
        result.url = serverConfig.getFileUrl(result.url);
      }
      
      // Гарантируем наличие относительного пути
      if (includeRelativePath && !result.path && result.url) {
        // Извлекаем относительный путь из полного URL
        if (result.url.startsWith(serverConfig.filesBaseUrl)) {
          result.path = result.url.replace(serverConfig.filesBaseUrl, '');
        }
      }
      
      return result;
    }).filter(Boolean);
  }
}

module.exports = new FileService();