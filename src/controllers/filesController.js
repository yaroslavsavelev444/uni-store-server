// controllers/filesController.js
const logger = require("../logger/logger");
const fileService = require("../services/fileService");

class FilesController {
  /**
   * Загрузка файлов
   */
  async uploadFiles(req, res) {
    try {
      // Получаем файлы из middleware
      const files = req.uploadedFiles || req.files || [];
      const userId = req.user?.id || req.body.userId;

      logger.info(`[UPLOAD_FILES] Запрос от пользователя ${userId}, файлов: ${files.length}`);

      // Проверяем наличие файлов
      if (!files || files.length === 0) {
        logger.warn('[UPLOAD_FILES] Нет файлов для загрузки');
        return res.status(400).json({
          success: false,
          message: "Нет файлов для загрузки"
        });
      }

      // Обрабатываем файлы
      const results = [];
      const errors = [];

      for (const file of Array.isArray(files) ? files : [files]) {
        try {
          if (!file || !file.originalname || !file.filename) {
            throw new Error('Некорректный файл');
          }

          const result = await fileService.saveFile(userId, file);
          results.push({
            id: result.tempName,
            tempName: result.tempName,
            url: result.url,
            userId: result.userId,
            originalName: file.originalname,
            name: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
            createdAt: new Date().toISOString(),
            alt: file.originalname
          });
        } catch (error) {
          logger.error(`Ошибка обработки файла: ${error.message}`, error);
          errors.push({
            fileName: file?.originalname || 'Неизвестный файл',
            error: error.message
          });
        }
      }

      // Проверяем, есть ли успешные загрузки
      if (results.length === 0) {
        logger.error('[UPLOAD_FILES] Не удалось загрузить ни один файл');
        return res.status(500).json({
          success: false,
          message: "Не удалось загрузить ни один файл",
          errors
        });
      }

      logger.info(`[UPLOAD_FILES] Успешно загружено ${results.length} файлов`);

      // Возвращаем результат
      return res.status(200).json(results);

    } catch (error) {
      logger.error(`[UPLOAD_FILES] ${error.message}`, error);
      return res.status(500).json({
        success: false,
        message: "Внутренняя ошибка сервера",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }


  async deleteFiles(req, res) {
  try {
    const { files } = req.body;
    
    logger.info(`[DELETE_FILES] Запрос на удаление ${files?.length || 0} файлов`);

    console.log('files', files);
    
    // Валидация входных данных
    if (!files || !Array.isArray(files) || files.length === 0) {
      logger.warn('[DELETE_FILES] Нет файлов для удаления');
      return res.status(400).json({
        success: false,
        message: "Нет файлов для удаления"
      });
    }

    // Проверяем, что все элементы - строки
    if (files.some(file => typeof file !== 'string')) {
      logger.warn('[DELETE_FILES] Некорректные данные файлов');
      return res.status(400).json({
        success: false,
        message: "Некорректные данные файлов"
      });
    }

    // Удаляем файлы используя новый метод
    const results = await fileService.deleteFilesByUrls(files);

    // Проверяем результат удаления
    const successfulDeletes = results.filter(r => r.success).length;
    const failedDeletes = results.filter(r => !r.success);

    if (failedDeletes.length > 0) {
      logger.warn(`[DELETE_FILES] Не удалось удалить ${failedDeletes.length} файлов`);
    }

    logger.info(`[DELETE_FILES] Удалено ${successfulDeletes} файлов`);

    return res.status(200).json({ 
      success: true,
      message: `Удалено ${successfulDeletes} файлов`,
      details: results
    });

  } catch (error) {
    logger.error(`[DELETE_FILES] ${error.message}`, error);
    return res.status(500).json({
      success: false,
      message: "Внутренняя ошибка сервера при удалении файлов"
    });
  }
}


  /**
   * Получение информации о файле
   */
  async getFileInfo(req, res) {
    try {
      const { tempName } = req.params;

      if (!tempName) {
        return res.status(400).json({
          success: false,
          message: "Не указан идентификатор файла"
        });
      }

      const fileInfo = await fileService.getFileInfo(tempName);

      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          message: "Файл не найден"
        });
      }

      return res.status(200).json(fileInfo);

    } catch (error) {
      logger.error(`[GET_FILE_INFO] ${error.message}`, error);
      return res.status(500).json({
        success: false,
        message: "Ошибка получения информации о файле"
      });
    }
  }

  /**
   * Скачивание файла
   */
  async downloadFile(req, res) {
    try {
      const { tempName } = req.params;

      if (!tempName) {
        return res.status(400).json({
          success: false,
          message: "Не указан идентификатор файла"
        });
      }

      const filePath = await fileService.getFilePath(tempName);

      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Файл не найден"
        });
      }

      // Отправляем файл
      res.download(filePath, (error) => {
        if (error) {
          logger.error(`[DOWNLOAD_FILE] Ошибка отправки файла: ${error.message}`);
          if (!res.headersSent) {
            return res.status(500).json({
              success: false,
              message: "Ошибка отправки файла"
            });
          }
        }
      });

    } catch (error) {
      logger.error(`[DOWNLOAD_FILE] ${error.message}`, error);
      return res.status(500).json({
        success: false,
        message: "Ошибка при скачивании файла"
      });
    }
  }

  /**
   * Получение списка файлов пользователя
   */
  async getUserFiles(req, res) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Не указан идентификатор пользователя"
        });
      }

      const userFiles = await fileService.getUserFiles(userId);

      return res.status(200).json({
        success: true,
        files: userFiles,
        count: userFiles.length
      });

    } catch (error) {
      logger.error(`[GET_USER_FILES] ${error.message}`, error);
      return res.status(500).json({
        success: false,
        message: "Ошибка получения файлов пользователя"
      });
    }
  }
}

module.exports = new FilesController();