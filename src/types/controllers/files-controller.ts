// types/files-controller.ts
import type { Query } from "express-serve-static-core";
import type {
  UploadedFile,
  UploadResult,
} from "../../services/fileStorage.service.js";
import type { AuthRequest, OptionalAuthRequest } from "../auth.js";

/**
 * Query
 */
export interface ServeFileQuery extends Query {
  preview?: string;
}

/**
 * Params
 */
export interface FileParams {
  fileId: string;
}

/**
 * Body (upload)
 */
export interface UploadFilesBody {
  accessType?: "public" | "private" | "restricted";
  entityType?: string;
  entityId?: string;
}

/**
 * Response
 */
export interface UploadFilesResponse extends Array<UploadResult> {}

export interface DeleteFileResponse {
  success: boolean;
}

/**
 * Расширение AuthRequest под multer
 */
export interface FilesUploadRequest extends AuthRequest<
  {},
  UploadFilesResponse,
  UploadFilesBody,
  Query
> {
  uploadedFiles?: UploadedFile[];
}

export type ServeFileRequest = OptionalAuthRequest<
  FileParams,
  any,
  {},
  ServeFileQuery
>;

export type DeleteFileRequest = AuthRequest<
  FileParams,
  DeleteFileResponse,
  {},
  Query
>;
