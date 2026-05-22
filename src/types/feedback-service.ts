// types/feedback-service.types.ts
import type {
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
  IDeviceInfo,
  IFeedback,
} from "./feedback.types.js";
import type { UserRole } from "./user.types.js";

export interface SubmitFeedbackData {
  title: string;
  description: string;
  type: FeedbackType;
  attachments?: string[];
  userId?: string;
  userEmail?: string;
  userName?: string;
  userRole?: UserRole;
  deviceInfo?: IDeviceInfo;
  ipAddress?: string;
}

export interface SubmitFeedbackResult extends IFeedback {}

export interface GetFeedbackParams {
  id: string;
  userId: string;
  userRole: string;
}

export interface GetAllFeedbacksOptions {
  page?: number;
  limit?: number;
  type?: FeedbackType;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  assignedTo?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetAllFeedbacksResult {
  feedbacks: IFeedback[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: {
    status: Record<string, number>;
    priority: Record<string, number>;
  };
}

export interface UpdateStatusParams {
  feedbackId: string;
  status: FeedbackStatus;
  adminId: string;
  note?: string;
}

export interface UpdatePriorityParams {
  feedbackId: string;
  priority: FeedbackPriority;
  adminId: string;
}

export interface AddInternalNoteParams {
  feedbackId: string;
  note: string;
  adminId: string;
  isPrivate?: boolean;
}

export interface UpdateInternalNoteParams {
  feedbackId: string;
  noteId: string;
  note: string;
  adminId: string;
}

export interface DeleteInternalNoteParams {
  feedbackId: string;
  noteId: string;
  adminId: string;
}

export interface AddTagParams {
  feedbackId: string;
  tag: string;
  adminId: string;
}

export interface RemoveTagParams {
  feedbackId: string;
  tag: string;
  adminId: string;
}

export interface MarkAsDuplicateParams {
  feedbackId: string;
  duplicateOfId: string;
  adminId: string;
  note?: string;
}

export interface DeleteFeedbackParams {
  feedbackId: string;
  adminId: string;
}

export interface ExportToCSVOptions {
  fromDate?: Date | string;
  toDate?: Date | string;
  type?: FeedbackType;
  status?: FeedbackStatus;
}

export interface UserStatsResult {
  total: number;
  open: number;
  resolved: number;
  closed: number;
}

export interface AdminStatsResult {
  total: number;
  byStatus: Array<{
    status: string;
    count: number;
    avgDaysOpen: number;
  }>;
}

export interface NotifyAdminsParams {
  feedback: IFeedback;
}

export interface NotifyUserStatusChangeParams {
  feedback: IFeedback;
  oldStatus: string;
  newStatus: string;
}

export interface NotifyAssignedUserParams {
  feedback: IFeedback;
  assignedUser: any;
}
