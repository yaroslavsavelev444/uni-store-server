import crypto from "crypto";
import { promises as fs } from "fs";
import { decode } from "iconv-lite";
import { basename, extname, join } from "path";
import redisClient from "../redis/redis.client.js";

/**
 * Входной тип вложения
 */
export interface AttachmentInput {
  tempName?: string;
  url?: string;
  originalName?: string | Buffer;
  size?: number;
  mimeType?: string;
}

/**
 * Выходной тип (после обработки)
 */
export interface AttachmentResult {
  url?: string;
  tempName?: string;
  permanentName?: string;
  originalName?: string;
  size?: number;
  mimeType?: string;
  uploadedAt?: Date;
  moved: boolean;
  movedAt?: Date;
  error?: string;
}

class FileManager {
  static decodeFileName(fileName: string | Buffer): string {
    try {
      if (Buffer.isBuffer(fileName)) {
        const encodings = [
          "utf8",
          "windows-1251",
          "cp1251",
          "iso-8859-5",
          "koi8-r",
        ];

        for (const encoding of encodings) {
          try {
            const decoded = decode(fileName, encoding);
            if (!decoded.includes("�")) {
              return decoded;
            }
          } catch {}
        }

        return fileName.toString("latin1");
      }

      if (typeof fileName === "string") {
        if (
          /[^\x00-\x7F]/.test(fileName) &&
          fileName.match(/[\u{0080}-\u{FFFF}]/gu)
        ) {
          return fileName;
        }

        const encodings = [
          "utf8",
          "windows-1251",
          "cp1251",
          "iso-8859-5",
          "koi8-r",
          "latin1",
        ];

        for (const encoding of encodings) {
          try {
            const buffer = Buffer.from(fileName, "binary");
            const decoded = decode(buffer, encoding);
            if (!decoded.includes("�") && decoded.length > 0) {
              return decoded;
            }
          } catch {}
        }
      }

      return typeof fileName === "string" ? fileName : "unknown_file";
    } catch (error: any) {
      console.warn(
        "[FILE_MANAGER] Ошибка декодирования имени файла:",
        fileName,
        error?.message,
      );
      return typeof fileName === "string" ? fileName : "unknown_file";
    }
  }

  static normalizeFileName(fileName: string | Buffer): string {
    try {
      const decodedName = FileManager.decodeFileName(fileName);

      let safeName = decodedName
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_{2,}/g, "_")
        .trim();

      if (safeName.length > 255) {
        const ext = extname(safeName);
        const nameWithoutExt = basename(safeName, ext);
        safeName = nameWithoutExt.substring(0, 240) + ext;
      }

      return safeName;
    } catch (error: any) {
      console.warn(
        "[FILE_MANAGER] Ошибка нормализации имени файла:",
        fileName,
        error?.message,
      );
      return "normalized_file";
    }
  }

  static generateSafeFileName(originalName: string | Buffer): string {
    try {
      const normalizedName = FileManager.normalizeFileName(originalName);

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 10);
      const fileExt = extname(normalizedName) || ".bin";

      return `${timestamp}-${randomString}${fileExt}`;
    } catch (error: any) {
      console.warn(
        "[FILE_MANAGER] Ошибка генерации имени файла:",
        originalName,
        error?.message,
      );
      return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.bin`;
    }
  }

  static async moveTempFilesToPermanent(
    attachments: AttachmentInput[] = [],
    targetDir = "feedback",
  ): Promise<AttachmentResult[]> {
    try {
      if (!attachments.length) return [];

      const uploadsDir = join(__dirname, "..", "uploads");
      const tempDir = join(uploadsDir, "temp");
      const targetPath = join(uploadsDir, targetDir);

      await fs.mkdir(targetPath, { recursive: true });

      const movedFiles: AttachmentResult[] = [];

      for (const attachment of attachments) {
        if (!attachment.tempName) {
          console.warn("У вложения нет tempName:", attachment);
          continue;
        }

        const tempFilePath = join(tempDir, attachment.tempName);

        const decodedOriginalName = FileManager.decodeFileName(
          attachment.originalName || attachment.tempName,
        );

        const fileName = FileManager.generateSafeFileName(decodedOriginalName);
        const targetFilePath = join(targetPath, fileName);

        try {
          await fs.access(tempFilePath);

          const stats = await fs.stat(tempFilePath);
          const fileSize = stats.size;

          const MAX_FILE_SIZE = 50 * 1024 * 1024;

          if (fileSize > MAX_FILE_SIZE) {
            movedFiles.push({
              ...attachment,
              originalName: decodedOriginalName,
              moved: false,
              error: `Файл слишком большой (${Math.round(fileSize / 1024 / 1024)}MB). Максимум 50MB`,
              size: fileSize,
            });
            continue;
          }

          await fs.rename(tempFilePath, targetFilePath);

          movedFiles.push({
            url: `/uploads/${targetDir}/${fileName}`,
            tempName: attachment.tempName,
            permanentName: fileName,
            originalName: decodedOriginalName,
            size: fileSize,
            mimeType:
              attachment.mimeType ||
              FileManager.getMimeTypeFromName(decodedOriginalName),
            uploadedAt: new Date(),
            moved: true,
            movedAt: new Date(),
          });
        } catch (error: any) {
          if (error.code === "ENOENT") {
            movedFiles.push({
              ...attachment,
              originalName: decodedOriginalName,
              moved: false,
              error: "Файл не найден",
            });
          } else {
            movedFiles.push({
              ...attachment,
              originalName: decodedOriginalName,
              moved: false,
              error: error?.message,
            });
          }
        }
      }

      return movedFiles;
    } catch (error) {
      console.error("Ошибка moveTempFilesToPermanent:", error);
      throw error;
    }
  }

  static getMimeTypeFromName(fileName: string): string {
    const ext = extname(fileName).toLowerCase();

    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain",
      ".zip": "application/zip",
      ".rar": "application/x-rar-compressed",
    };

    return mimeTypes[ext] || "application/octet-stream";
  }

  static async cleanupTempFiles(tempFiles: string[] = []): Promise<void> {
    try {
      if (!tempFiles.length) return;

      const uploadsDir = join(__dirname, "..", "uploads");
      const tempDir = join(uploadsDir, "temp");

      for (const tempFile of tempFiles) {
        const tempFilePath = join(tempDir, tempFile);

        try {
          await fs.access(tempFilePath);
          await fs.unlink(tempFilePath);
        } catch (error: any) {
          if (error.code !== "ENOENT") {
            console.warn("Ошибка удаления:", error?.message);
          }
        }
      }
    } catch (error) {
      console.error("Ошибка cleanup:", error);
    }
  }

  static getFileUrl(filePath: string): string {
    if (!filePath) return filePath;

    if (filePath.startsWith("http")) return filePath;

    const port = process.env.PORT || "3002";

    if (filePath.startsWith("/files/")) {
      const base =
        process.env.NODE_ENV === "production"
          ? process.env.PUBLIC_BASE_URL || "https://api.comersi.ru"
          : `http://localhost:${port}`;
      return `${base}${filePath}`;
    }

    if (filePath.startsWith("/uploads/")) {
      const base =
        process.env.NODE_ENV === "production"
          ? process.env.PUBLIC_BASE_URL!
          : `http://localhost:${port}`;
      return `${base}${filePath}`;
    }

    return filePath;
  }

  static async getFileInfo(filePath: string): Promise<{
    exists: boolean;
    size?: number;
    modifiedAt?: Date;
    createdAt?: Date;
    error?: string;
  }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        size: stats.size,
        modifiedAt: stats.mtime,
        createdAt: stats.birthtime,
      };
    } catch (error: any) {
      return {
        exists: false,
        error: error?.message,
      };
    }
  }

  static async getSignedPreviewUrl(fileId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");

    await redisClient.setex(`preview:${fileId}`, 3600, token);

    const baseUrl =
      process.env.NODE_ENV === "production"
        ? process.env.PUBLIC_BASE_URL || "https://api.comersi.ru"
        : `http://localhost:${process.env.PORT || 3002}`;

    return `${baseUrl}/files/${fileId}?preview=${token}`;
  }

  static extractFileIdFromUrl(url: string): string | null {
    try {
      if (!url) return null;

      const parsed = new URL(url);

      // /files/<id>
      const match = parsed.pathname.match(/^\/files\/([^/]+)$/);

      if (!match) return null;

      return match[1];
    } catch (e) {
      console.warn("[FileManager] extractFileIdFromUrl error:", url);
      return null;
    }
  }
}

export default FileManager;
