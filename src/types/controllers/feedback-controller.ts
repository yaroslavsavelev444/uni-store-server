// types/feedback-controller.ts

import type { Request } from "express";
import type { Query } from "express-serve-static-core";
import type {
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
  IFeedback,
} from "../feedback.types.js";

// Типы для параметров URL
export interface ParamsWithId {
  id: string;
}

export interface ParamsWithIdAndNoteId {
  id: string;
  noteId: string;
}

export interface ParamsWithIdAndTag {
  id: string;
  tag: string;
}

// Типы для query параметров
export interface GetAllFeedbacksQuery extends Query {
  page?: string;
  limit?: string;
  type?: FeedbackType;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  assignedTo?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ExportToCSVQuery extends Query {
  fromDate?: string;
  toDate?: string;
  type?: FeedbackType;
  status?: FeedbackStatus;
}

// Типы для тела запросов
export interface SubmitFeedbackBody {
  title: string;
  description: string;
  type: FeedbackType;
  attachments?: string[];
}

export interface UpdateStatusBody {
  status: FeedbackStatus;
  note?: string;
}

export interface UpdatePriorityBody {
  priority: FeedbackPriority;
}

export interface AddInternalNoteBody {
  note: string;
  isPrivate?: boolean;
}

export interface UpdateInternalNoteBody {
  note: string;
}

export interface AddTagBody {
  tag: string;
}

export interface MarkAsDuplicateBody {
  duplicateOf: string;
  note?: string;
}

// Типы для ответов
export interface SubmitFeedbackResponse {
  message: string;
  feedbackId: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
}

export interface FeedbackResponse {
  message: string;
  feedback: Partial<IFeedback>;
}

export interface FeedbackWithPreviousStatus extends IFeedback {
  previousStatus?: FeedbackStatus;
}

export interface UpdateStatusResponse {
  message: string;
  feedback: {
    id: string;
    status: FeedbackStatus;
    previousStatus?: FeedbackStatus;
    updatedAt: Date;
  };
}

export interface UpdatePriorityResponse {
  message: string;
  feedback: IFeedback;
}

export interface AddInternalNoteResponse {
  message: string;
  note: any; // Замените на конкретный тип заметки
}

export interface DeleteResponse {
  message: string;
}

export interface AddTagResponse {
  message: string;
  feedback: IFeedback;
}

export interface GetAllFeedbacksResponse {
  feedbacks: IFeedback[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AdminStatsResponse {
  total: number;
  byStatus: Record<FeedbackStatus, number>;
  byType?: Record<FeedbackType, number>; // опционально
  byPriority?: Record<FeedbackPriority, number>; // опционально
  averageResponseTime?: number;
}

export interface UserStatsResponse {
  total: number;
  lastFeedback?: Date;
}

// Типы для пользовательских запросов (authMiddleware(['all']))
export type SubmitFeedbackReq = Request<
  {},
  SubmitFeedbackResponse,
  SubmitFeedbackBody,
  Query
>;
export type GetFeedbackReq = Request<ParamsWithId, IFeedback, {}, Query>;
export type GetUserStatsReq = Request<{}, UserStatsResponse, {}, Query>;

// Типы для админских запросов (authMiddleware(['admin']))
export type GetAllFeedbacksReq = Request<
  {},
  GetAllFeedbacksResponse,
  {},
  GetAllFeedbacksQuery
>;
export type UpdateStatusReq = Request<
  ParamsWithId,
  UpdateStatusResponse,
  UpdateStatusBody,
  Query
>;
export type UpdatePriorityReq = Request<
  ParamsWithId,
  UpdatePriorityResponse,
  UpdatePriorityBody,
  Query
>;
export type AddInternalNoteReq = Request<
  ParamsWithId,
  AddInternalNoteResponse,
  AddInternalNoteBody,
  Query
>;
export type UpdateInternalNoteReq = Request<
  ParamsWithIdAndNoteId,
  FeedbackResponse,
  UpdateInternalNoteBody,
  Query
>;
export type DeleteInternalNoteReq = Request<
  ParamsWithIdAndNoteId,
  FeedbackResponse,
  {},
  Query
>;
export type AddTagReq = Request<
  ParamsWithId,
  AddTagResponse,
  AddTagBody,
  Query
>;
export type RemoveTagReq = Request<
  ParamsWithIdAndTag,
  FeedbackResponse,
  {},
  Query
>;
export type MarkAsDuplicateReq = Request<
  ParamsWithId,
  FeedbackResponse,
  MarkAsDuplicateBody,
  Query
>;
export type DeleteFeedbackReq = Request<
  ParamsWithId,
  DeleteResponse,
  {},
  Query
>;
export type GetAdminStatsReq = Request<{}, AdminStatsResponse, {}, Query>;
export type ExportToCSVReq = Request<{}, string, {}, ExportToCSVQuery>;
