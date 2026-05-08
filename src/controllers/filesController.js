// controllers/filesController.js
import logger from "../logger/logger.js";
import fileService from "../services/fileService.js";

const uploadFiles = async (req, res, next) => {
  try {
    const files = req.uploadedFiles || [];
    const { accessType = "private", entityType, entityId } = req.body;

    const userId = req.user.id;

    if (!files.length) {
      return res.status(400).json({ message: "Нет файлов" });
    }

    const results = await fileStorageService.uploadAndSave(files, {
      accessType,
      entityType,
      entityId,
      ownerId: userId,
    });

    logger.info({
      message: "Files uploaded",
      count: results.length,
      userId,
    });

    return res.status(200).json(results);
  } catch (e) {
    next(e);
  }
};

const serveFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const previewToken =
      typeof req.query.preview === "string" ? req.query.preview : null;

    const userId = req.user?.id || "";

    const { absolutePath, mimeType } = await fileStorageService.serveFile(
      fileId,
      userId,
      previewToken,
    );

    logger.info({
      message: "File served",
      absolutePath,
      mimeType,
      userId,
    });
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");

    return res.sendFile(absolutePath);
  } catch (e) {
    const error = e;

    if (error.message.includes("Нет прав")) {
      return res.status(403).json({ message: error.message });
    }

    return res.status(404).json({ message: "Файл не найден" });
  }
};

const deleteFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const success = await fileStorageService.deleteFile(fileId, userId);

    return res.status(200).json({ success });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  uploadFiles,
  serveFile,
  deleteFile,
};
