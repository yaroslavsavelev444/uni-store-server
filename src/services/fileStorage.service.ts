// services/fileStorage.service.ts

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type mongoose from "mongoose";
import logger from "../logger/logger.js";
import type { FileEntityType } from "../models/file-model.js";
import { FileModel } from "../models/index.models.js";
import redis from "../redis/redis.client.js";
import FileManager from "../utils/fileManager.js";

/**
 * Тип входящего файла (multer / express)
 */
export interface UploadedFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Опции загрузки
 */
export interface UploadOptions {
  accessType: "public" | "private" | "restricted";
  entityType?: string;
  entityId?: string;
  ownerId: string;
}

/**
 * Результат загрузки
 */
export interface UploadResult {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/**
 * Ответ при отдаче файла
 */
export interface ServeFileResult {
  absolutePath: string;
  mimeType: string;
  filename?: string;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join("/var/data/uploads");

const TEMP_DIR = path.join(UPLOAD_DIR, "temp");

class FileStorageService {
  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(TEMP_DIR, { recursive: true });

    logger.info(`[FileStorage] Директории готовы: ${UPLOAD_DIR}`);
  }

  // ====================== ВСПОМОГАТЕЛЬНЫЕ ======================
  private getTargetDir(
    accessType: UploadOptions["accessType"],
    entityId?: string,
    ownerId?: string,
  ): string {
    if (accessType === "public") {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      return path.join("public", String(year), month);
    }

    if (accessType === "restricted" && entityId) {
      return path.join("chats", String(entityId));
    }

    return path.join("users", String(ownerId));
  }

  private generateStoredName(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase() || ".bin";
    const uuid = crypto.randomUUID();
    return `${uuid}${ext}`;
  }

  // ====================== ОСНОВНЫЕ ======================
  async uploadAndSave(
    files: UploadedFile[],
    options: UploadOptions,
  ): Promise<UploadResult[]> {
    const { accessType, entityType, entityId, ownerId } = options;

    const results: UploadResult[] = [];

    for (const file of files) {
      const storedName = this.generateStoredName(file.originalname);

      const targetDir = this.getTargetDir(accessType, entityId, ownerId);
      const fullTargetDir = path.join(UPLOAD_DIR, targetDir);
      const targetPath = path.join(fullTargetDir, storedName);

      await fs.mkdir(fullTargetDir, { recursive: true });

      await fs.cp(file.path, targetPath);
      await fs.unlink(file.path).catch(() => {});

      const doc = await FileModel.create({
        ownerId,
        accessType,
        entityType,
        entityId,
        originalName: file.originalname,
        storedName,
        storagePath: `/${targetDir}/${storedName}`,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      });

      results.push({
        id: String(doc._id),
        url: await FileManager.getSignedPreviewUrl(String(doc._id)),
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    }

    return results;
  }

  async checkIfExists(
    fileId: string | string[],
  ): Promise<string | string[] | null> {
    const fileDocs = await FileModel.find({
      _id: { $in: Array.isArray(fileId) ? fileId : [fileId] },
      deletedAt: null,
    });

    const ids = fileDocs.map((f) => f._id);

    return ids.length ? ids : null;
  }

  // ====================== ОТДАЧА ======================
  async serveFile(
    fileId: string,
    requestingUserId: string,
    previewToken: string | null = null,
  ): Promise<ServeFileResult> {
    logger.info(
      {
        message: "Попытка отдать файл",
        fileId,
        requestingUserId,
        previewToken,
      },
      "FileStorageService.serveFile",
    );
    const fileDoc = await FileModel.findOne({
      _id: fileId,
      deletedAt: null,
    });
    if (!fileDoc) throw new Error("Файл не найден");

    // === Signed URL ===
    if (previewToken) {
      const redisToken = await redis.get(`preview:${fileId}`);
      if (redisToken === previewToken) {
        const absolutePath = path.join(UPLOAD_DIR, fileDoc.storagePath);
        return { absolutePath, mimeType: fileDoc.mimeType };
      }
    }

    // === Access check ===
    const cacheKey = `file_access:${fileId}:${requestingUserId}`;
    const cached = await redis.get(cacheKey);
    if (cached !== "allowed") {
      if (fileDoc.accessType === "public") {
        // ok
      } else if (fileDoc.accessType === "private") {
        if (String(fileDoc.ownerId) !== String(requestingUserId)) {
          throw new Error("Нет прав (private)");
        }
      } else if (fileDoc.accessType === "restricted") {
        const isOwner = String(fileDoc.ownerId) === String(requestingUserId);
        const isAllowed =
          isOwner ||
          (fileDoc.allowedUsers || []).some(
            (id: any) => String(id) === String(requestingUserId),
          );

        if (!isAllowed) throw new Error("Нет прав (restricted)");

        await redis.setex(cacheKey, 300, "allowed"); // 5 минут
      }
    }

    const absolutePath = path.join(UPLOAD_DIR, fileDoc.storagePath);
    return {
      absolutePath,
      mimeType: fileDoc.mimeType,
      filename: fileDoc.originalName,
    };
  }

  async grantAccessToRestrictedFiles(
    fileIds: string[],
    allowedUserIds: string[],
    entityType?: FileEntityType,
    entityId?: string,
    session?: mongoose.ClientSession, // <-- новый параметр
  ): Promise<void> {
    if (!fileIds?.length || !allowedUserIds?.length) return;

    const update: any = {
      $addToSet: { allowedUsers: { $each: allowedUserIds } },
    };

    if (entityType) update.entityType = entityType;
    if (entityId) update.entityId = entityId;

    const query = FileModel.updateMany(
      {
        _id: { $in: fileIds },
        accessType: "restricted",
        deletedAt: null,
      },
      update,
    );

    if (session) {
      query.session(session);
    }

    await query;

    logger.info({
      message: "Access granted to restricted files",
      fileCount: fileIds.length,
      userCount: allowedUserIds.length,
      entityType,
      entityId,
    });
  }

  // ====================== УДАЛЕНИЕ ======================
  async deleteFile(fileId: string, ownerId: string): Promise<boolean> {
    const fileDoc = await FileModel.findOne({
      _id: fileId,
      ownerId,
      deletedAt: null,
    });

    if (!fileDoc) return false;

    const absolutePath = path.join(UPLOAD_DIR, fileDoc.storagePath);

    await fs.unlink(absolutePath).catch(() => {});

    fileDoc.deletedAt = new Date();
    await fileDoc.save();

    return true;
  }
  async deleteFiles(
    fileIds: string[],
    requestingUserId: string,
  ): Promise<boolean[]> {
    if (!fileIds.length) return [];

    const results: boolean[] = [];

    for (const fileId of fileIds) {
      try {
        const success = await this.deleteFile(fileId, requestingUserId);
        results.push(success);
      } catch (e) {
        logger.warn({
          message: "Failed to delete file",
          fileId,
          requestingUserId,
        });
        results.push(false);
      }
    }

    return results;
  }
}

export default new FileStorageService();
