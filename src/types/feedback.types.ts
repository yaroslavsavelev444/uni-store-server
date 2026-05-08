import type { Document, Model, Types } from "mongoose";

export type FeedbackType = "bug" | "improvement" | "feature" | "other";
export type FeedbackStatus =
  | "new"
  | "in_progress"
  | "resolved"
  | "closed"
  | "duplicate"
  | "wont_fix";
export type FeedbackPriority = "low" | "medium" | "high" | "critical";
export type UserRole = "user" | "lawyer" | "admin" | "moderator";

export interface IAttachment {
  url: string;
  tempName?: string;
  originalName?: string;
  size?: number;
  mimeType?: string;
  uploadedAt?: Date;
}

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

export interface IFeedback {
  title: string;
  description: string;
  type: FeedbackType;
  userId?: Types.ObjectId;
  userEmail?: string;
  userName?: string;
  userRole?: UserRole;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  attachments: IAttachment[];
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
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IFeedbackVirtuals = {};

export type IFeedbackMethods = {};

export interface FeedbackModelType extends Model<
  IFeedbackDocument,
  {},
  IFeedbackMethods
> {
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

export type IFeedbackDocument = Document<unknown, {}, IFeedback> &
  IFeedback &
  IFeedbackVirtuals &
  IFeedbackMethods;
