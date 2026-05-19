// types/faq-controller.ts

import type { AuthRequest, OptionalAuthRequest } from "../auth.js";
import type { IFaqQuestion, IFaqTopic } from "../faq.types.js";
import type { PublicFaqTopic } from "../faq-service.js";

// Базовый формат ответа
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

// Параметры маршрута
export interface TopicIdParam {
  id: string;
}

export interface TopicAndQuestionParams {
  topicId: string;
  questionId: string;
}

// Тело для создания/обновления темы
export interface CreateTopicBody {
  title: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

export type UpdateTopicBody = Partial<CreateTopicBody>;

// Тело для создания/обновления вопроса
export interface CreateQuestionBody {
  question: string;
  answer: string;
  order?: number;
  isActive?: boolean;
}

export type UpdateQuestionBody = Partial<CreateQuestionBody>;

// Тело для переупорядочивания тем
export interface ReorderTopicsBody {
  orders: Array<{ topicId: string; order: number }>;
}

// Тело для переупорядочивания вопросов
export interface ReorderQuestionsBody {
  orders: Array<{ questionId: string; order: number }>;
}

// Типизированные запросы
// Публичные – без авторизации
import type { Request } from "express";
export type GetPublicFaqReq = Request<
  {},
  ApiResponse<PublicFaqTopic[]>,
  {},
  {}
>;

// Админские – с обязательной авторизацией
export type GetAllFaqForAdminReq = AuthRequest<
  {},
  ApiResponse<IFaqTopic[]>,
  {},
  {}
>;
export type CreateTopicReq = AuthRequest<
  {},
  ApiResponse<IFaqTopic>,
  CreateTopicBody,
  {}
>;
export type UpdateTopicReq = AuthRequest<
  TopicIdParam,
  ApiResponse<IFaqTopic>,
  UpdateTopicBody,
  {}
>;
export type DeleteTopicReq = AuthRequest<
  TopicIdParam,
  ApiResponse<null>,
  {},
  {}
>;
export type AddQuestionReq = AuthRequest<
  TopicIdParam,
  ApiResponse<IFaqQuestion>,
  CreateQuestionBody,
  {}
>;
export type UpdateQuestionReq = AuthRequest<
  TopicAndQuestionParams,
  ApiResponse<IFaqQuestion>,
  UpdateQuestionBody,
  {}
>;
export type DeleteQuestionReq = AuthRequest<
  TopicAndQuestionParams,
  ApiResponse<null>,
  {},
  {}
>;
export type ReorderTopicsReq = AuthRequest<
  {},
  ApiResponse<null>,
  ReorderTopicsBody,
  {}
>;
export type ReorderQuestionsReq = AuthRequest<
  TopicIdParam,
  ApiResponse<null>,
  ReorderQuestionsBody,
  {}
>;
