import { promises as fs } from "node:fs";
import logger from "../logger/logger.js";
import fileService from "../services/fileService.js";

const { checkUserQuota } = fileService;

export default (options = {}) => {
  const maxBytes = (options.maxTotalSizeMB || 100) * 1024 * 1024;

  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const newFiles = req.uploadedFiles || [];
      const additionalBytes = newFiles.reduce((sum, f) => sum + f.size, 0);

      await checkUserQuota(userId, additionalBytes, maxBytes);
      next();
    } catch (error) {
      // При превышении квоты удаляем уже загруженные временные файлы
      if (req.uploadedFiles && req.uploadedFiles.length) {
        for (const file of req.uploadedFiles) {
          await fs.unlink(file.path).catch(() => {});
        }
      }
      logger.warn(
        `[QUOTA] Отказ в загрузке для ${req.user.id}: ${error.message}`,
      );
      return res.status(403).json({ success: false, message: error.message });
    }
  };
};
