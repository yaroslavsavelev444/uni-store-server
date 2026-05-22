import type { NextFunction, Response } from "express";
import logger from "../logger/logger.js";
import fileStorageService from "../services/fileStorage.service.js";

import type {
  DeleteFileRequest,
  FilesUploadRequest,
  ServeFileRequest,
} from "../types/controllers/files-controller.js";

export const uploadFiles = async (
  req: FilesUploadRequest,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
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

export const serveFile = async (
  req: ServeFileRequest,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
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
  } catch (e: unknown) {
    const error = e as Error;

    if (error.message.includes("Нет прав")) {
      return res.status(403).json({ message: error.message });
    }

    return res.status(404).json({ message: "Файл не найден" });
  }
};

export const deleteFile = async (
  req: DeleteFileRequest,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    const success = await fileStorageService.deleteFile(fileId, userId);

    return res.status(200).json({ success });
  } catch (e) {
    next(e);
  }
};
export const downloadFile = async (
  req: ServeFileRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.id || "";

    const { absolutePath, mimeType, filename } =
      await fileStorageService.serveFile(fileId, userId);

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename || "file")}`,
    );
    res.setHeader("Cache-Control", "private, no-cache");

    return res.sendFile(absolutePath);
  } catch (e: any) {
    if (e.message.includes("Нет прав")) {
      return res.status(403).json({ message: e.message });
    }
    return res.status(404).json({ message: "Файл не найден" });
  }
};
