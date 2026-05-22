// types/consent-controller.ts
import type { AuthRequest, OptionalAuthRequest } from "../auth.js";
import type { IConsent } from "../consent.types.js";

// Базовый формат ответа
export interface ConsentResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

// Тип для согласия с дополнительной статистикой уведомлений
export interface ConsentWithNotificationStats extends IConsent {
  notificationStats?: {
    notified: number;
    totalUsers: number;
    channels: string[];
  } | null;
}

// Параметры маршрута с slug
export interface SlugParam {
  slug: string;
}

// Тело запроса для создания соглашения
export interface CreateConsentBody {
  title: string;
  slug: string;
  description?: string;
  content: string;
  isRequired?: boolean;
  needsAcceptance?: boolean;
  documentUrl?: string;
}

// Тело запроса для обновления соглашения
export interface UpdateConsentBody {
  title?: string;
  description?: string;
  content?: string;
  isRequired?: boolean;
  needsAcceptance?: boolean;
  documentUrl?: string;
  changeDescription?: string;
  notifyUsers?: boolean;
  notificationTypes?: string[];
}

// Типизированные запросы (админские методы с обязательной авторизацией)
export type CreateConsentReq = AuthRequest<
  {},
  ConsentResponse<IConsent>,
  CreateConsentBody,
  {}
>;
export type UpdateConsentReq = AuthRequest<
  SlugParam,
  ConsentResponse<ConsentWithNotificationStats>,
  UpdateConsentBody,
  {}
>;
export type ActivateConsentReq = AuthRequest<
  SlugParam,
  ConsentResponse<IConsent>,
  {},
  {}
>;
export type DeactivateConsentReq = AuthRequest<
  SlugParam,
  ConsentResponse<IConsent>,
  {},
  {}
>;
export type DeleteConsentReq = AuthRequest<
  SlugParam,
  ConsentResponse<{ message: string }>,
  {},
  {}
>;

// Публичные методы (авторизация не требуется)
import type { Request } from "express";
export type GetForRegistrationReq = Request<
  {},
  ConsentResponse<IConsent[]>,
  {},
  {}
>;
export type GetRequiredForAcceptanceReq = Request<
  {},
  ConsentResponse<IConsent[]>,
  {},
  {}
>;
export type ListConsentsReq = Request<{}, ConsentResponse<IConsent[]>, {}, {}>;
export type GetBySlugReq = Request<
  SlugParam,
  ConsentResponse<IConsent>,
  {},
  {}
>;
