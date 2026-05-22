import type { HydratedDocument, Model, PopulatedDoc, Types } from "mongoose";
import type { IFile } from "./file.types.js";
import type { UserRole } from "./user.types.js";

// === Вспомогательные типы ===
export type FeedbackType = "bug" | "improvement" | "feature" | "other";
export type FeedbackStatus =
  | "new"
  | "in_progress"
  | "resolved"
  | "closed"
  | "duplicate"
  | "wont_fix";
export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface IInternalNote {
  note: string;
  createdBy?: Types.ObjectId;
  createdAt?: Date;
  isPrivate?: boolean;
}

export interface IDeviceInfo {
  userAgent?: string;
  platform?: string;
  os?: string;
  browser?: string;
  screenResolution?: string;
}

// === Базовый интерфейс данных (только поля, сохраняемые в БД) ===
export interface IFeedback {
  _id: Types.ObjectId;
  title: string;
  description: string;
  type: FeedbackType;
  userId?: Types.ObjectId;
  userEmail?: string;
  userName?: string;
  userRole?: UserRole;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  attachments: string[] | PopulatedDoc<IFile>[] | null;
  assignedTo?: Types.ObjectId;
  tags: string[];
  internalNotes: IInternalNote[];
  viewCount: number;
  upvotes: number;
  upvotedBy: Types.ObjectId[];
  relatedTo: Types.ObjectId[];
  duplicateOf?: Types.ObjectId;
  resolvedAt?: Date;
  closedAt?: Date;
  dueDate?: Date;
  deviceInfo?: IDeviceInfo;
  ipAddress?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// === Методы экземпляра (пустые, т.к. их нет) ===
export type IFeedbackMethods = {};

// === Статические методы модели ===
export interface IFeedbackModel extends Model<IFeedback, {}, IFeedbackMethods> {
  getStats(userId: Types.ObjectId): Promise<{
    total: number;
    open: number;
    resolved: number;
    closed: number;
  }>;
  getAdminStats(): Promise<{
    total: number;
    byStatus: Array<{ status: string; count: number; avgDaysOpen: number }>;
  }>;
}

// === Тип полноценного документа (с методами) ===
export type FeedbackDocument = HydratedDocument<IFeedback, IFeedbackMethods>;
