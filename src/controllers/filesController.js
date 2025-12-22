// controllers/filesController.js
const logger = require("../logger/logger");
const fileService = require("../services/fileService");

const uploadFiles = async (req, res, next) => {
  try {
    // Ваш middleware сохраняет в req.uploadedFiles
    const files = req.uploadedFiles || req.files;
    const userId = req.user?.id || req.body.userId;

    console.log('Files received:', files);
    console.log('User ID:', userId);

    if (!files || (Array.isArray(files) && files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Нет файлов для загрузки"
      });
    }

    // Преобразуем файлы в массив
    const fileArray = Array.isArray(files) ? files : [];
    
    if (fileArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Нет файлов для загрузки"
      });
    }

    // Обрабатываем каждый файл
    const results = [];
    
    for (const file of fileArray) {
      try {
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
        });
      } catch (error) {
        logger.error(`Ошибка обработки файла ${file.originalname}:`, error);
        // Продолжаем обработку других файлов
        results.push({
          error: `Ошибка обработки файла ${file.originalname}: ${error.message}`,
          originalName: file.originalname
        });
      }
    }

    // Разделяем успешные и неуспешные загрузки
    const successfulUploads = results.filter(r => !r.error);
    const failedUploads = results.filter(r => r.error);

    if (successfulUploads.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Не удалось загрузить ни один файл",
        errors: failedUploads.map(f => f.error)
      });
    }

    // Логируем результат
    logger.info(`[UPLOAD_FILES] Успешно загружено ${successfulUploads.length} файлов пользователем ${userId}`);
    
    if (failedUploads.length > 0) {
      logger.warn(`[UPLOAD_FILES] Не удалось загрузить ${failedUploads.length} файлов`);
    }

    return res.status(200).json(successfulUploads);
  } catch (error) {
    logger.error(`[UPLOAD_FILES] ${error.message}`, error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const deleteFiles = async (req, res, next) => {
  try {
    const { files } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Нет файлов для удаления"
      });
    }

    await fileService.deleteFiles(files);
    
    logger.info(`[DELETE_FILES] Удалено ${files.length} файлов`);
    
    return res.status(200).json({ 
      success: true,
      message: `Удалено ${files.length} файлов`
    });
  } catch (error) {
    logger.error(`[DELETE_FILES] ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Дополнительные методы
const getFileInfo = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const fileInfo = await fileService.getFileInfo(fileId);
    
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: "Файл не найден"
      });
    }
    
    return res.status(200).json(fileInfo);
  } catch (error) {
    logger.error(`[GET_FILE_INFO] ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const downloadFile = async (req, res, next) => {
  try {
    const { tempName } = req.params;
    const filePath = await fileService.getFilePath(tempName);
    
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: "Файл не найден"
      });
    }
    
    res.download(filePath);
  } catch (error) {
    logger.error(`[DOWNLOAD_FILE] ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = { 
  uploadFiles, 
  deleteFiles,
  getFileInfo,
  downloadFile
};