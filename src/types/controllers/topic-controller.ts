// types/topic-controller.ts
import type { Request } from "express";
import type { AuthRequest } from "../auth.js";
import type { ITopicCommon } from "../topicCommon.types.js";

// === Параметры URL ===
export interface SlugParams {
  slug: string;
}

export interface IdParams {
  id: string;
}

// === Тела запросов ===
// Базовый тип для блока контента (как в ITopicCommon, но value может быть строкой при загрузке)
export interface ContentBlockInput {
  type: "text" | "image" | "link" | "heading" | "list" | "highlighted";
  value: string | { url: string; text: string } | string[];
}

// Для создания темы
export interface CreateTopicBody {
  title: string;
  slug: string;
  description?: string;
  position?: number;
  contentBlocks?: ContentBlockInput[] | string; // Может быть JSON-строкой
}

// Для обновления темы
export interface UpdateTopicBody {
  title?: string;
  slug?: string;
  description?: string;
  position?: number;
  imageUrl?: string;
  contentBlocks?: ContentBlockInput[] | string;
}

// === Файлы (multer) ===
export interface TopicFiles {
  cover?: Express.Multer.File[];
  contentImages?: Express.Multer.File[];
}

// === Ответы ===
// Для getBySlug - расширенный ITopicCommon с relatedTopics
export interface TopicWithRelatedResponse extends ITopicCommon {
  relatedTopics: Pick<ITopicCommon, "_id" | "slug" | "title">[];
}

// === Типизированные запросы ===

// Публичные методы (без авторизации)
export type GetAllTopicsReq = Request<{}, ITopicCommon[], {}, {}>;
export type GetTopicBySlugReq = Request<
  SlugParams,
  TopicWithRelatedResponse,
  {},
  {}
>;

// Админские методы (требуют авторизации)
export type CreateTopicReq = AuthRequest<
  {},
  ITopicCommon,
  CreateTopicBody,
  {}
> & {
  files?: TopicFiles;
};
export type UpdateTopicReq = AuthRequest<
  IdParams,
  ITopicCommon,
  UpdateTopicBody,
  {}
> & {
  files?: TopicFiles;
};
export type DeleteTopicReq = AuthRequest<IdParams, never, {}, {}>; // статус 204, тело пустое
