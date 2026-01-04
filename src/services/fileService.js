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

  /**
   * Создание необходимых директорий
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
      
      // Создаем .gitkeep файлы
      await Promise.all([
        fs.writeFile(path.join(this.uploadsDir, '.gitkeep'), ''),
        fs.writeFile(path.join(this.tempDir, '.gitkeep'), '')
      ]);
      
      logger.info(`[FILE_SERVICE] Директории созданы: ${this.tempDir}`);
    } catch (error) {
      logger.error(`[FILE_SERVICE] Ошибка создания директорий: ${error.message}`);
      throw error;
    }
  }

  /**
   * Сохранение файла
   */
  async saveFile(userId, file) {
    try {
      // Проверяем входные данные
      if (!file || !file.filename || !file.path) {
        throw new Error('Некорректные данные файла');
      }

      const tempName = file.filename;
      const tempPath = file.path;

      logger.info(`[FILE_SERVICE] Сохранение файла: ${tempName} для пользователя ${userId}`);

      // Проверяем существование файла
      try {
        await fs.access(tempPath);
      } catch (error) {
        throw new Error(`Файл не найден по пути: ${tempPath}`);
      }

      // Создаем метаданные
      const fileMeta = {
        id: crypto.randomUUID(),
        tempName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        userId,
        path: `/uploads/temp/${tempName}`,
        url: serverConfig.getTempFileUrl(tempName),
        alt: path.parse(file.originalname).name
      };

      // Сохраняем метаданные
      await this.saveFileMetadata(userId, fileMeta);

      logger.info(`[FILE_SERVICE] Файл сохранен: ${tempName}`);

      return fileMeta;

    } catch (error) {
      logger.error(`[FILE_SERVICE] Ошибка сохранения файла: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Сохранение метаданных файла
   */
  async saveFileMetadata(userId, fileMeta) {
    const metaPath = path.join(this.tempDir, `${userId}_meta.json`);
    let existingMeta = [];

    try {
      const metaContent = await fs.readFile(metaPath, 'utf8');
      existingMeta = JSON.parse(metaContent);
    } catch (error) {
      // Файл не существует, создаем новый
      logger.info(`[FILE_SERVICE] Создание нового файла метаданных для пользователя ${userId}`);
    }

    // Удаляем старую запись с таким же tempName
    existingMeta = existingMeta.filter(meta => meta.tempName !== fileMeta.tempName);
    
    // Добавляем новую запись
    existingMeta.push(fileMeta);

    // Сохраняем
    await fs.writeFile(metaPath, JSON.stringify(existingMeta, null, 2), 'utf8');
    
    logger.debug(`[FILE_SERVICE] Метаданные сохранены для файла: ${fileMeta.tempName}`);
  }

  /**
   * Удаление файлов
   */
  async deleteFiles(tempNames) {
    const results = [];

    for (const tempName of tempNames) {
      try {
        const filePath = path.join(this.tempDir, tempName);
        
        // Проверяем существование файла
        try {
          await fs.access(filePath);
        } catch (error) {
          logger.warn(`[FILE_SERVICE] Файл ${tempName} не существует`);
          results.push({ 
            success: true, 
            tempName, 
            message: 'Файл не существует (возможно уже удален)' 
          });
          continue;
        }
        
        // Удаляем файл
        await fs.unlink(filePath);
        
        // Очищаем метаданные
        await this.cleanupMetadata(tempName);
        
        results.push({ 
          success: true, 
          tempName, 
          message: 'Файл успешно удален' 
        });
        
        logger.info(`[FILE_SERVICE] Файл удален: ${tempName}`);

      } catch (error) {
        logger.error(`[FILE_SERVICE] Ошибка удаления файла ${tempName}:`, error);
        results.push({ 
          success: false, 
          tempName, 
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * Очистка метаданных
   */
  async cleanupMetadata(tempName) {
    try {
      const metaFiles = await fs.readdir(this.tempDir);
      const userMetaFiles = metaFiles.filter(f => f.endsWith('_meta.json'));

      for (const metaFile of userMetaFiles) {
        const metaPath = path.join(this.tempDir, metaFile);
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const metadata = JSON.parse(metaContent);

        // Фильтруем записи без указанного файла
        const filteredMetadata = metadata.filter(meta => meta.tempName !== tempName);

        if (filteredMetadata.length !== metadata.length) {
          await fs.writeFile(metaPath, JSON.stringify(filteredMetadata, null, 2), 'utf8');
          logger.debug(`[FILE_SERVICE] Метаданные очищены для файла: ${tempName}`);
        }
      }
    } catch (error) {
      logger.error(`[FILE_SERVICE] Ошибка очистки метаданных: ${error.message}`);
    }
  }

  /**
   * Получение информации о файле
   */
  async getFileInfo(tempName) {
    try {
      const metaFiles = await fs.readdir(this.tempDir);
      const userMetaFiles = metaFiles.filter(f => f.endsWith('_meta.json'));

      for (const metaFile of userMetaFiles) {
        const metaPath = path.join(this.tempDir, metaFile);
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const metadata = JSON.parse(metaContent);
        
        const fileInfo = metadata.find(m => m.tempName === tempName);
        
        if (fileInfo) {
          return fileInfo;
        }
      }

      return null;

    } catch (error) {
      logger.error(`[FILE_SERVICE] Ошибка получения информации о файле ${tempName}:`, error);
      return null;
    }
  }

  /**
   * Получение пути к файлу
   */
  async getFilePath(tempName) {
    const filePath = path.join(this.tempDir, tempName);
    
    try {
      await fs.access(filePath);
      return filePath;
    } catch (error) {
      return null;
    }
  }

  /**
   * Получение файлов пользователя
   */
  async getUserFiles(userId) {
    try {
      const metaPath = path.join(this.tempDir, `${userId}_meta.json`);
      
      try {
        await fs.access(metaPath);
      } catch (error) {
        return []; // Файл метаданных не существует
      }

      const metaContent = await fs.readFile(metaPath, 'utf8');
      const metadata = JSON.parse(metaContent);

      // Проверяем существование файлов
      const validFiles = [];
      
      for (const fileMeta of metadata) {
        const filePath = path.join(this.tempDir, fileMeta.tempName);
        
        try {
          await fs.access(filePath);
          validFiles.push(fileMeta);
        } catch (error) {
          // Файл не существует, удаляем из метаданных
          await this.cleanupMetadata(fileMeta.tempName);
        }
      }

      return validFiles;

    } catch (error) {
      logger.error(`[FILE_SERVICE] Ошибка получения файлов пользователя ${userId}:`, error);
      return [];
    }
  }

  /**
   * Получение статистики файлов
   */
  async getFilesStats() {
    try {
      const files = await fs.readdir(this.tempDir);
      const metaFiles = files.filter(f => f.endsWith('_meta.json'));
      
      let totalFiles = 0;
      let totalSize = 0;
      const users = new Set();

      for (const metaFile of metaFiles) {
        try {
          const metaPath = path.join(this.tempDir, metaFile);
          const metaContent = await fs.readFile(metaPath, 'utf8');
          const metadata = JSON.parse(metaContent);
          
          totalFiles += metadata.length;
          metadata.forEach(meta => {
            totalSize += meta.size || 0;
            if (meta.userId) {
              users.add(meta.userId);
            }
          });
        } catch (error) {
          // Пропускаем поврежденные файлы метаданных
        }
      }

      return {
        totalFiles,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        uniqueUsers: users.size,
        storagePath: this.tempDir
      };

    } catch (error) {
      logger.error(`[FILE_SERVICE] Ошибка получения статистики файлов: ${error.message}`);
      return null;
    }
  }
}

module.exports = new FileService();