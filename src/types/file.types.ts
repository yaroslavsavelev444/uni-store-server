import type mongoose from "mongoose";
import type { HydratedDocument, Model } from "mongoose";

/**
 * ====================== ОСНОВНАЯ СТРУКТУРА ======================
 */
export type FileAccessType = "public" | "private" | "restricted";

export type FileEntityType = "chat" | "product" | "feedback" | null;

export interface IFile {
  _id: string;

  ownerId: mongoose.Types.ObjectId;

  accessType: FileAccessType;
  allowedUsers?: mongoose.Types.ObjectId[];
  entityType: FileEntityType;
  entityId: mongoose.Types.ObjectId | null;

  originalName: string;
  storedName: string;
  storagePath: string;

  mimeType: string;
  sizeBytes: number;

  isCompressed: boolean;
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * ====================== METHODS ======================
 */
export interface IFileMethods {
  toJSON(): IFile & { url: string };
}

/**
 * ====================== MODEL ======================
 */
export interface IFileModel extends Model<IFile, {}, IFileMethods> {
  findByIdForUser(
    fileId: string,
    userId: string,
  ): Promise<HydratedDocument<IFile> | null>;
}

/**
 * ====================== DOCUMENT ======================
 */
export type FileDocument = HydratedDocument<IFile, IFileMethods>;
