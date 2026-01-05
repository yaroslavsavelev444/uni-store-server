const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const iconv = require('iconv-lite');

class FileManager {
  /**
   * Проверяет существование файла
   * @param {string} filePath - путь к файлу
   * @returns {Promise<boolean>} - true если файл существует
   */
  /**
 * Проверяет существование файла
 * @param {string} filePath - путь к файлу
 * @returns {Promise<boolean>} - true если файл существует
 */
static async validateFileExists(filePath) {
  let originalFilePath = filePath; // Сохраняем оригинальный путь
  
  try {
    console.log(`[FILE_MANAGER] Проверка файла: ${filePath}`);
    
    let absolutePath;
    
    // Если это полный URL, извлекаем путь
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      const url = new URL(filePath);
      filePath = url.pathname; // Извлекаем только путь
      console.log(`[FILE_MANAGER] Извлечен путь из URL: ${filePath}`);
    }
    
    // Если путь начинается с /uploads/ (относительный URL)
    if (filePath.startsWith('/uploads/')) {
      // Преобразуем в абсолютный путь от корня проекта
      absolutePath = path.join(process.cwd(), filePath);
      
      // Альтернативные пути для проверки
      const possiblePaths = [
        absolutePath,
        path.join(process.cwd(), 'src', filePath.substring(1)), // /app/src/uploads/temp/...
        path.join(__dirname, '..', '..', filePath.substring(1)), // для Docker контейнера
      ];
      
      console.log(`[FILE_MANAGER] Возможные пути:`, possiblePaths);
      
      // Пробуем каждый путь
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          console.log(`[FILE_MANAGER] Файл найден по пути: ${possiblePath}`);
          return true;
        } catch (err) {
          // Продолжаем пробовать другие пути
          console.log(`[FILE_MANAGER] Путь не найден: ${possiblePath}`);
        }
      }
    } 
    // Если путь абсолютный
    else if (path.isAbsolute(filePath)) {
      absolutePath = filePath;
    }
    // Если путь относительный (без начального /)
    else {
      absolutePath = path.join(process.cwd(), 'uploads', filePath);
    }
    
    console.log(`[FILE_MANAGER] Финальный проверяемый путь: ${absolutePath}`);
    await fs.access(absolutePath);
    console.log(`[FILE_MANAGER] Файл существует: ${originalFilePath}`);
    return true;
  } catch (error) {
    console.error(`[FILE_MANAGER] Ошибка проверки файла ${originalFilePath}:`, error.message);
    
    if (error.code === 'ENOENT') {
      throw new Error(`Файл не найден: ${originalFilePath}`);
    }
    throw new Error(`Ошибка при проверке файла ${originalFilePath}: ${error.message}`);
  }
}
  /**
   * Удаляет файл
   * @param {string} filePath - путь к файлу
   * @returns {Promise<boolean>} - true если файл удален
   */
  static async deleteFile(filePath) {
    try {
      // Если путь относительный (начинается с /uploads)
      if (filePath.startsWith('/uploads/')) {
        // Преобразуем в абсолютный путь
        const absolutePath = path.join(__dirname, '..', '..', filePath);
        await fs.unlink(absolutePath);
        console.log(`Файл удален: ${filePath}`);
        return true;
      }
      
      // Если путь абсолютный
      await fs.unlink(filePath);
      console.log(`Файл удален: ${filePath}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`Файл не найден при удалении: ${filePath}`);
        return false;
      }
      console.error(`Ошибка при удалении файла ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Перемещает файл
   * @param {string} sourcePath - исходный путь
   * @param {string} targetPath - целевой путь
   * @returns {Promise<string>} - новый путь к файлу
   */
  static async moveFile(sourcePath, targetPath) {
    try {
      let sourceAbsolute, targetAbsolute;
      
      // Обрабатываем исходный путь
      if (sourcePath.startsWith('/uploads/')) {
        sourceAbsolute = path.join(__dirname, '..', '..', sourcePath);
      } else {
        sourceAbsolute = sourcePath;
      }
      
      // Обрабатываем целевой путь
      if (targetPath.startsWith('/uploads/')) {
        targetAbsolute = path.join(__dirname, '..', '..', targetPath);
        
        // Создаем директорию если нужно
        const targetDir = path.dirname(targetAbsolute);
        await fs.mkdir(targetDir, { recursive: true });
      } else {
        targetAbsolute = targetPath;
        const targetDir = path.dirname(targetAbsolute);
        await fs.mkdir(targetDir, { recursive: true });
      }
      
      // Проверяем существование исходного файла
      await fs.access(sourceAbsolute);
      
      // Перемещаем файл
      await fs.rename(sourceAbsolute, targetAbsolute);
      
      console.log(`Файл перемещен: ${sourcePath} -> ${targetPath}`);
      
      // Возвращаем целевой путь (относительный или абсолютный, в зависимости от входных данных)
      return targetPath;
    } catch (error) {
      if (error.code === 'ENOENT' && error.path === sourceAbsolute) {
        throw new Error(`Исходный файл не найден: ${sourcePath}`);
      }
      throw new Error(`Ошибка при перемещении файла: ${error.message}`);
    }
  }


  /**
   * Декодирует имя файла из разных кодировок в UTF-8
   * @param {string} fileName - имя файла
   * @returns {string} - декодированное имя файла в UTF-8
   */
  static decodeFileName(fileName) {
    try {
      // Если имя файла уже в UTF-8, возвращаем как есть
      if (Buffer.isBuffer(fileName)) {
        // Пробуем декодировать из разных кодировок
        const encodings = ['utf8', 'windows-1251', 'cp1251', 'iso-8859-5', 'koi8-r'];
        
        for (const encoding of encodings) {
          try {
            const decoded = iconv.decode(fileName, encoding);
            // Проверяем, что декодирование успешно (нет нечитаемых символов)
            if (!decoded.includes('�')) {
              return decoded;
            }
          } catch (e) {
            continue;
          }
        }
        
        // Если не удалось декодировать, возвращаем как Latin-1
        return fileName.toString('latin1');
      }
      
      // Если это строка, проверяем кодировку
      if (typeof fileName === 'string') {
        // Проверяем, не является ли строка уже UTF-8 с кракозябрами
        if (/[^\x00-\x7F]/.test(fileName) && fileName.match(/[\u{0080}-\u{FFFF}]/gu)) {
          // Это уже UTF-8, возвращаем как есть
          return fileName;
        }
        
        // Пробуем разные кодировки
        const encodings = ['utf8', 'windows-1251', 'cp1251', 'iso-8859-5', 'koi8-r', 'latin1'];
        
        for (const encoding of encodings) {
          try {
            const buffer = Buffer.from(fileName, 'binary');
            const decoded = iconv.decode(buffer, encoding);
            if (!decoded.includes('�') && decoded.length > 0) {
              return decoded;
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      // Если все провалилось, возвращаем оригинальное имя
      return fileName;
    } catch (error) {
      console.warn('[FILE_MANAGER] Ошибка декодирования имени файла:', fileName, error.message);
      return typeof fileName === 'string' ? fileName : 'unknown_file';
    }
  }

  /**
   * Нормализует имя файла: удаляет небезопасные символы
   * @param {string} fileName - имя файла
   * @returns {string} - безопасное имя файла
   */
  static normalizeFileName(fileName) {
    try {
      // Декодируем имя файла
      const decodedName = this.decodeFileName(fileName);
      
      // Удаляем небезопасные символы
      let safeName = decodedName
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Заменяем небезопасные символы
        .replace(/\s+/g, '_') // Заменяем пробелы на подчеркивания
        .replace(/_{2,}/g, '_') // Убираем двойные подчеркивания
        .trim();
      
      // Если имя слишком длинное, обрезаем
      if (safeName.length > 255) {
        const ext = path.extname(safeName);
        const nameWithoutExt = path.basename(safeName, ext);
        safeName = nameWithoutExt.substring(0, 240) + ext;
      }
      
      return safeName;
    } catch (error) {
      console.warn('[FILE_MANAGER] Ошибка нормализации имени файла:', fileName, error.message);
      return 'normalized_file';
    }
  }

  /**
   * Создает безопасное имя файла для хранения
   * @param {string} originalName - оригинальное имя файла
   * @returns {string} - безопасное имя файла
   */
  static generateSafeFileName(originalName) {
    try {
      // Нормализуем имя файла
      const normalizedName = this.normalizeFileName(originalName);
      
      // Создаем уникальное имя
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 10);
      const fileExt = path.extname(normalizedName) || '.bin';
      const fileName = `${timestamp}-${randomString}${fileExt}`;
      
      return fileName;
    } catch (error) {
      console.warn('[FILE_MANAGER] Ошибка генерации имени файла:', originalName, error.message);
      return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.bin`;
    }
  }

  /**
   * Перемещает файлы из временной папки в целевую
   * @param {Array} attachments - массив вложений {tempName, url, originalName, size, mimeType}
   * @param {string} targetDir - целевая директория (например: 'feedback')
   * @returns {Promise<Array>} - массив новых путей файлов
   */
  static async moveTempFilesToPermanent(attachments = [], targetDir = 'feedback') {
    try {
      if (!attachments || attachments.length === 0) {
        return [];
      }

      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const tempDir = path.join(uploadsDir, 'temp');
      const targetPath = path.join(uploadsDir, targetDir);

      // Создаем целевую директорию если нет
      await fs.mkdir(targetPath, { recursive: true });

      const movedFiles = [];

      for (const attachment of attachments) {
        if (!attachment.tempName) {
          console.warn('У вложения нет tempName:', attachment);
          continue;
        }

        const tempFilePath = path.join(tempDir, attachment.tempName);
        
        // ДЕКОДИРУЕМ оригинальное имя файла
        const decodedOriginalName = this.decodeFileName(attachment.originalName || attachment.tempName);
        
        // Создаем безопасное имя файла для хранения
        const fileName = this.generateSafeFileName(decodedOriginalName);
        
        const targetFilePath = path.join(targetPath, fileName);

        try {
          // Проверяем существование файла
          await fs.access(tempFilePath);
          
          // Получаем информацию о файле
          const stats = await fs.stat(tempFilePath);
          const fileSize = stats.size;
          
          // Проверяем размер файла (макс 50MB)
          const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
          if (fileSize > MAX_FILE_SIZE) {
            console.warn(`Файл слишком большой: ${decodedOriginalName} (${Math.round(fileSize / 1024 / 1024)}MB)`);
            movedFiles.push({
              ...attachment,
              originalName: decodedOriginalName, // Декодированное имя
              moved: false,
              error: `Файл слишком большой (${Math.round(fileSize / 1024 / 1024)}MB). Максимум 50MB`,
              size: fileSize
            });
            continue;
          }
          
          // Перемещаем файл
          await fs.rename(tempFilePath, targetFilePath);
          
          // Создаем новый объект файла с ДЕКОДИРОВАННЫМИ именами
          const newAttachment = {
            url: `/uploads/${targetDir}/${fileName}`,
            tempName: attachment.tempName,
            permanentName: fileName,
            originalName: decodedOriginalName, // Декодированное оригинальное имя
            size: fileSize,
            mimeType: attachment.mimeType || this.getMimeTypeFromName(decodedOriginalName),
            uploadedAt: new Date(),
            moved: true,
            movedAt: new Date()
          };

          movedFiles.push(newAttachment);
          
          console.log(`Файл перемещен: ${attachment.tempName} -> ${fileName} (${decodedOriginalName})`);
        } catch (error) {
          if (error.code === 'ENOENT') {
            console.warn(`Временный файл не найден: ${attachment.tempName}`);
            movedFiles.push({
              ...attachment,
              originalName: decodedOriginalName, // Декодированное имя
              moved: false,
              error: 'Файл не найден во временной папке'
            });
          } else {
            console.error(`Ошибка при перемещении файла ${attachment.tempName}:`, error);
            movedFiles.push({
              ...attachment,
              originalName: decodedOriginalName, // Декодированное имя
              moved: false,
              error: error.message
            });
          }
        }
      }

      return movedFiles;
    } catch (error) {
      console.error('Ошибка в FileManager.moveTempFilesToPermanent:', error);
      throw error;
    }
  }

  /**
   * Определяет MIME-тип по расширению файла
   */
  static getMimeTypeFromName(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Очищает временные файлы, которые не были перемещены
   * @param {Array} tempFiles - массив временных имен файлов
   */
  static async cleanupTempFiles(tempFiles = []) {
    try {
      if (!tempFiles || tempFiles.length === 0) {
        return;
      }

      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const tempDir = path.join(uploadsDir, 'temp');

      for (const tempFile of tempFiles) {
        if (!tempFile) continue;
        
        const tempFilePath = path.join(tempDir, tempFile);
        
        try {
          await fs.access(tempFilePath);
          await fs.unlink(tempFilePath);
          console.log(`Временный файл удален: ${tempFile}`);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn(`Не удалось удалить временный файл ${tempFile}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при очистке временных файлов:', error);
    }
  }


static getFileUrl(filePath) {
  // Уже полный URL — не трогаем
  if (
    typeof filePath !== 'string' ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://')
  ) {
    return filePath;
  }

  // Не uploads — не трогаем
  if (!filePath.startsWith('/uploads/')) {
    return filePath;
  }

  // PROD
  if (process.env.NODE_ENV === 'production') {
    const baseUrl = process.env.PUBLIC_BASE_URL;

    if (!baseUrl) {
      throw new Error('PUBLIC_BASE_URL is not defined in production');
    }

    return `${baseUrl}${filePath}`;
  }

  // DEV (как работало раньше)
  const port = process.env.PORT || '3003';
  return `http://localhost:${port}${filePath}`;
}


static getAbsolutePath(filePath) {
  console.log(`[FILE_MANAGER] Получение абсолютного пути для: ${filePath}`);
  
  const fs = require('fs');
  const path = require('path');
  
  // Если это полный URL, извлекаем путь
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    const url = new URL(filePath);
    filePath = url.pathname; // Извлекаем только путь
    
    // Декодируем URL-encoded символы
    filePath = decodeURIComponent(filePath);
    console.log(`[FILE_MANAGER] Извлечен и декодирован путь из URL: ${filePath}`);
  }
  
  // Проверяем, является ли путь реальным абсолютным путем в файловой системе
  const isRealAbsolutePath = (filePath) => {
    if (!path.isAbsolute(filePath)) return false;
    try {
      return fs.existsSync(filePath);
    } catch (err) {
      return false;
    }
  };
  
  // Если путь уже абсолютный и существует
  if (isRealAbsolutePath(filePath)) {
    console.log(`[FILE_MANAGER] Реальный абсолютный путь: ${filePath}`);
    return filePath;
  }
  
  // Если путь начинается с /uploads/ (это веб-путь)
  if (filePath.startsWith('/uploads/')) {
    // Убираем начальный слэш
    const relativePath = filePath.substring(1);
    
    // Основные возможные пути
    const possiblePaths = [
      path.join(process.cwd(), relativePath),                     // /app/uploads/temp/...
      path.join(process.cwd(), 'src', relativePath),              // /app/src/uploads/temp/...
      path.join(__dirname, '..', '..', relativePath),             // из utils/fileManager.js
    ];
    
    console.log(`[FILE_MANAGER] Проверяемые пути для ${filePath}:`, possiblePaths);
    
    // Возвращаем первый существующий путь
    for (const possiblePath of possiblePaths) {
      try {
        if (fs.existsSync(possiblePath)) {
          console.log(`[FILE_MANAGER] Найден существующий путь: ${possiblePath}`);
          return possiblePath;
        }
      } catch (err) {
        continue;
      }
    }
    
    // Если ничего не найдено, возвращаем наиболее вероятный путь
    const defaultPath = path.join(process.cwd(), 'src', relativePath);
    console.log(`[FILE_MANAGER] Используем путь по умолчанию: ${defaultPath}`);
    return defaultPath;
  }
  
  // Если путь относительный без префикса
  const absolutePath = path.join(process.cwd(), 'uploads', filePath);
  console.log(`[FILE_MANAGER] Относительный путь преобразован: ${absolutePath}`);
  return absolutePath;
}
  /**
   * Получает информацию о файле
   */
  static async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        size: stats.size,
        modifiedAt: stats.mtime,
        createdAt: stats.birthtime
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }
}

module.exports = FileManager;