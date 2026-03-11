import { promises as fs } from "node:fs";
import { join } from "node:path";
import { fileTypeFromFile } from "file-type"; // Изменено: fromFile -> fileTypeFromFile

import serverConfig from "../config/serverConfig.js";

const { uploadsDir } = serverConfig;

import logger from "../logger/logger.js";

const { error: _error, info } = logger;

import { FileModel } from "../models/index.models.js";

const { aggregate, countDocuments, deleteOne, find, findById, findOne } =
  FileModel;

// Заглушка для сервиса проверки прав на сущности
// В реальном проекте импортируйте нужный сервис (orderService, productService)
const entityService = {
  async canViewOrder(user, orderId) {
    // Пример: пользователь может просматривать заказ, если он админ или владелец заказа
    // Здесь должна быть реальная логика
    return user.role === "admin" || String(user.id) === String(orderId); // упрощённо
  },
  async canEditOrder(user, orderId) {
    return user.role === "admin"; // только админ может редактировать
  },
};

class FileService {
  constructor() {
    this.uploadsDir = join(process.cwd(), uploadsDir); // в продакшне /var/app/uploads
    this.tempDir = join(this.uploadsDir, "temp");
    this.permanentDir = join(this.uploadsDir, "permanent");
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.permanentDir, { recursive: true });
      // Исправление: вызываем info как метод logger, а не как деструктурированную функцию
      logger.info(`[FILE_SERVICE] Директории созданы`);
    } catch (error) {
      // Исправление: вызываем error как метод logger, а не как деструктурированную функцию
      logger.error(
        `[FILE_SERVICE] Ошибка создания директорий: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Сохраняет временный файл в БД
   * @param {string} userId - ID владельца
   * @param {Object} file - объект файла от multer
   * @param {string} [entityType] - тип сущности (order, product)
   * @param {string} [entityId] - ID сущности
   * @returns {Promise<Object>} сохранённый документ
   */
  async saveFile(userId, file, entityType = null, entityId = null) {
    try {
      if (!file || !file.filename || !file.path) {
        throw new Error("Некорректные данные файла");
      }

      // Проверка сигнатуры файла
      const type = await fileTypeFromFile(file.path);
      const allowedMime = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (!type || !allowedMime.includes(type.mime)) {
        await fs.unlink(file.path).catch(() => {});
        throw new Error(
          "Файл не является допустимым изображением (сигнатура не совпадает)",
        );
      }

      const tempName = file.filename;
      const fileMeta = {
        userId,
        tempName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        status: "temp",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 дней
        entityType,
        entityId,
      };

      const savedFile = await new FileModel(fileMeta).save();
      logger.info(`[FILE_SERVICE] Файл сохранён: ${tempName} для ${userId}`);
      return savedFile;
    } catch (error) {
      logger.error(
        `[FILE_SERVICE] Ошибка сохранения файла: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Проверка квоты пользователя
   */
  async checkUserQuota(
    userId,
    additionalBytes = 0,
    maxBytes = 100 * 1024 * 1024,
  ) {
    // Используем агрегацию для быстрого подсчёта
    const result = await aggregate.call(FileModel, [
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: "$size" } } },
    ]);
    const totalUsed = result.length ? result[0].total : 0;
    if (totalUsed + additionalBytes > maxBytes) {
      throw new Error(
        `Превышена квота хранилища (макс. ${maxBytes / 1024 / 1024} MB)`,
      );
    }
    return true;
  }

  /**
   * Удаление файлов по ID с проверкой прав
   * @param {Array} fileIds - массив _id
   * @param {Object} user - объект пользователя { id, role }
   * @returns {Promise<Array>} результаты по каждому файлу
   */
  async deleteFilesByIds(fileIds, user) {
    const results = [];
    for (const fileId of fileIds) {
      try {
        const file = await findById.call(FileModel, fileId);
        if (!file) {
          results.push({ success: false, fileId, error: "Файл не найден" });
          continue;
        }

        // Проверка прав на удаление
        const canDelete = await this._canDeleteFile(user, file);
        if (!canDelete) {
          results.push({ success: false, fileId, error: "Доступ запрещён" });
          continue;
        }

        await fs.unlink(file.path);
        await deleteOne.call(FileModel, { _id: fileId });
        results.push({ success: true, fileId });
        logger.info(`[FILE_SERVICE] Файл удалён: ${file.tempName}`);
      } catch (error) {
        results.push({ success: false, fileId, error: error.message });
        logger.error(`[FILE_SERVICE] Ошибка удаления: ${error.message}`);
      }
    }
    return results;
  }

  /**
   * Перемещение файла из temp в permanent
   * @param {string} fileId
   * @param {string} userId - ID владельца (должен совпадать)
   * @param {Object} options - { isPublic, entityType, entityId }
   * @returns {Promise<Object>} обновлённый документ
   */
  async moveFileToPermanent(
    fileId,
    userId,
    { isPublic = false, entityType = null, entityId = null } = {},
  ) {
    try {
      const file = await findOne.call(FileModel, { _id: fileId, userId });
      if (!file || file.status !== "temp") {
        throw new Error(
          "Файл не найден, не является временным или доступ запрещён",
        );
      }
      const userDir = join(this.permanentDir, userId);
      await fs.mkdir(userDir, { recursive: true });
      const newPath = join(userDir, file.tempName);
      await fs.rename(file.path, newPath);
      file.path = newPath;
      file.isPublic = isPublic;
      if (entityType) file.entityType = entityType;
      if (entityId) file.entityId = entityId;
      file.status = "permanent";
      file.expiresAt = null;
      // Если файл публичный, но токен ещё не сгенерирован – сработает pre-save
      await file.save();
      logger.info(
        `[FILE_SERVICE] Файл перемещён в permanent: ${file.tempName}`,
      );
      return file;
    } catch (error) {
      logger.error(`[FILE_SERVICE] Ошибка перемещения: ${error.message}`);
      throw error;
    }
  }

  /**
   * Получение информации о файле с учётом прав доступа
   * @param {string} fileId
   * @param {Object} user - объект пользователя { id, role } (может быть null для публичного доступа)
   * @returns {Promise<Object|null>}
   */
  async getFileInfo(fileId, user = null) {
    const file = await findById.call(FileModel, fileId);
    if (!file) return null;

    // Публичный файл доступен всем
    if (file.isPublic) return file;

    // Если пользователь не авторизован, доступ запрещён
    if (!user) return null;

    // Владелец имеет доступ
    if (String(file.userId) === String(user.id)) return file;

    // Если файл привязан к сущности, проверяем права на сущность
    if (file.entityType && file.entityId) {
      let canAccess = false;
      if (file.entityType === "order") {
        canAccess = await entityService.canViewOrder(user, file.entityId);
      }
      // Можно добавить другие типы (product и т.д.)
      if (canAccess) return file;
    }

    return null;
  }

  /**
   * Получение пути к файлу с проверкой прав
   */
  async getFilePath(fileId, user = null) {
    const file = await this.getFileInfo(fileId, user);
    return file ? file.path : null;
  }

  /**
   * Получение публичного файла по токену (без авторизации)
   * @param {string} token
   * @returns {Promise<Object|null>}
   */
  async getPublicFileByToken(token) {
    return findOne.call(FileModel, {
      publicToken: token,
      isPublic: true,
      status: "permanent",
    });
  }

  /**
   * Получение списка файлов пользователя с пагинацией
   * @param {string} userId
   * @param {number} page
   * @param {number} limit
   * @returns {Promise<{files: Array, total: number, page: number, pages: number}>}
   */
  async getUserFiles(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [files, total] = await Promise.all([
      find
        .call(FileModel, { userId })
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limit),
      countDocuments.call(FileModel, { userId }),
    ]);
    return {
      files,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Очистка устаревших временных файлов (запускается по cron)
   */
  async cleanupOldFiles() {
    const oldFiles = await find.call(FileModel, {
      expiresAt: { $lt: new Date() },
    });
    for (const file of oldFiles) {
      try {
        await fs.unlink(file.path);
        await deleteOne.call(FileModel, { _id: file._id });
        logger.info(`[CLEANUP] Удалён старый файл: ${file.tempName}`);
      } catch (error) {
        logger.error(`[CLEANUP] Ошибка: ${error.message}`);
      }
    }
  }

  // Вспомогательный метод для проверки права на удаление
  async _canDeleteFile(user, file) {
    // Админ может удалить любой файл
    if (user.role === "admin") return true;

    // Владелец может удалить свой файл
    if (String(file.userId) === String(user.id)) return true;

    // Если файл привязан к сущности, проверяем право на редактирование сущности
    if (file.entityType && file.entityId) {
      if (file.entityType === "order") {
        return await entityService.canEditOrder(user, file.entityId);
      }
      // Добавить другие типы
    }

    return false;
  }
}

export default new FileService();
