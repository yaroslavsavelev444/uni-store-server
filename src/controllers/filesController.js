import { promises as fs } from "node:fs";
import logger from "../logger/logger";
import {
  getUserFiles as _getUserFiles,
  deleteFilesByIds,
  getFileInfo,
  getFilePath,
  getPublicFileByToken,
  moveFileToPermanent,
  saveFile,
} from "../services/fileService";

class FilesController {
  async uploadFiles(req, res) {
    try {
      const files = req.uploadedFiles || [];
      const userId = req.user.id;
      const { entityType, entityId } = req.body; // опционально

      if (!files.length) {
        return res.status(400).json({ success: false, message: "Нет файлов" });
      }

      const results = [];
      for (const file of files) {
        const saved = await saveFile(userId, file, entityType, entityId);
        results.push({
          id: saved._id,
          tempName: saved.tempName,
          url: `/files/${saved._id}`,
          userId: saved.userId,
          originalName: saved.originalName,
          name: saved.originalName,
          size: saved.size,
          mimeType: saved.mimeType,
          createdAt: saved.uploadedAt.toISOString(),
          alt: saved.originalName,
        });
      }
      return res.status(200).json(results);
    } catch (error) {
      logger.error(`[UPLOAD_FILES] ${error.message}`, error);
      // Удаляем временные файлы при ошибке
      if (req.uploadedFiles) {
        await Promise.all(
          req.uploadedFiles.map((f) => fs.unlink(f.path).catch(() => {})),
        );
      }
      return res
        .status(500)
        .json({ success: false, message: "Ошибка загрузки" });
    }
  }

  async deleteFiles(req, res) {
    try {
      const { fileIds } = req.body;
      const user = req.user; // { id, role }

      if (!Array.isArray(fileIds) || !fileIds.length) {
        return res.status(400).json({ success: false, message: "Нет файлов" });
      }

      const results = await deleteFilesByIds(fileIds, user);
      const successful = results.filter((r) => r.success).length;
      return res.status(200).json({
        success: true,
        message: `Удалено ${successful}`,
        details: results,
      });
    } catch (error) {
      logger.error(`[DELETE_FILES] ${error.message}`, error);
      return res
        .status(500)
        .json({ success: false, message: "Ошибка удаления" });
    }
  }

  async confirmFiles(req, res) {
    try {
      const { fileIds, isPublic, entityType, entityId } = req.body;
      const userId = req.user.id;

      if (!Array.isArray(fileIds) || !fileIds.length) {
        return res.status(400).json({ success: false, message: "Нет файлов" });
      }

      const results = [];
      for (const fileId of fileIds) {
        try {
          const moved = await moveFileToPermanent(fileId, userId, {
            isPublic: !!isPublic,
            entityType,
            entityId,
          });
          results.push({
            id: moved._id,
            success: true,
            publicToken: moved.publicToken || null,
            url: moved.isPublic ? `/public/files/${moved.publicToken}` : null,
          });
        } catch (error) {
          results.push({ id: fileId, success: false, error: error.message });
        }
      }
      return res.status(200).json(results);
    } catch (error) {
      logger.error(`[CONFIRM_FILES] ${error.message}`, error);
      return res
        .status(500)
        .json({ success: false, message: "Ошибка подтверждения" });
    }
  }

  async downloadFile(req, res) {
    try {
      const { id } = req.params;
      const user = req.user; // может быть undefined, если роут защищён, но для единообразия

      const filePath = await getFilePath(id, user);
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Файл не найден или доступ запрещён",
        });
      }

      const fileInfo = await getFileInfo(id, user);
      res.download(filePath, fileInfo.originalName);
    } catch (error) {
      logger.error(`[DOWNLOAD_FILE] ${error.message}`, error);
      return res
        .status(500)
        .json({ success: false, message: "Ошибка скачивания" });
    }
  }

  // Публичный доступ по токену (без авторизации)
  async publicDownloadFile(req, res) {
    try {
      const { token } = req.params;

      const file = await getPublicFileByToken(token);
      if (!file) {
        return res
          .status(404)
          .json({ success: false, message: "Файл не найден" });
      }

      // Для изображений лучше использовать sendFile, чтобы браузер отображал, а не скачивал
      if (file.mimeType.startsWith("image/")) {
        res.sendFile(file.path);
      } else {
        res.download(file.path, file.originalName);
      }
    } catch (error) {
      logger.error(`[PUBLIC_DOWNLOAD] ${error.message}`, error);
      return res.status(500).json({ success: false, message: "Ошибка" });
    }
  }

  async getUserFiles(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const result = await _getUserFiles(userId, page, limit);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      logger.error(`[GET_USER_FILES] ${error.message}`, error);
      return res
        .status(500)
        .json({ success: false, message: "Ошибка получения списка" });
    }
  }

  // Дополнительно: получение файлов, привязанных к сущности (например, для заказа)
  async getEntityFiles(req, res) {
    try {
      const { entityType, entityId } = req.params;
      const user = req.user;

      // Проверяем, имеет ли пользователь право просматривать эту сущность
      let canView = false;
      if (entityType === "order") {
        canView = await entityService.canViewOrder(user, entityId);
      }
      // Добавить другие типы

      if (!canView) {
        return res
          .status(403)
          .json({ success: false, message: "Доступ запрещён" });
      }

      const files = await File.find({
        entityType,
        entityId,
        status: "permanent",
      });
      return res.status(200).json({ success: true, files });
    } catch (error) {
      logger.error(`[GET_ENTITY_FILES] ${error.message}`, error);
      return res.status(500).json({ success: false, message: "Ошибка" });
    }
  }
}

export default new FilesController();
