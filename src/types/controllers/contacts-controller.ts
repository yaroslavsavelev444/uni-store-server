// types/contacts-controller.ts
import type contactsService from "../../services/contactsService.js";
import type {
  DefaultContactStructure,
  EmptyContactStructure,
} from "../../services/contactsService.js";
import type { AuthRequest, OptionalAuthRequest } from "../auth.js";
import type { IContact } from "../contact.types.js";

export type UpdateContactsData = NonNullable<
  Awaited<ReturnType<typeof contactsService.updateContacts>>
>;

// Базовый формат ответа
export interface ContactsResponse<T = unknown> {
  success: boolean;
  data?: EmptyContactStructure | DefaultContactStructure | T;
  message?: string;
  meta?: {
    version?: number;
    cache?: boolean;
    isAdmin?: boolean;
    updatedBy?: string;
    cacheInvalidated?: boolean;
  };
}

// Для getContacts: используется OptionalAuthRequest (пользователь может быть не авторизован)
export type GetContactsReq = OptionalAuthRequest<
  {},
  ContactsResponse<IContact>,
  {},
  {}
>;

// Для getAdminContacts: требуется авторизация (админ)
export type GetAdminContactsReq = AuthRequest<
  {},
  ContactsResponse<IContact>,
  {},
  {}
>;

// Тело запроса для updateContacts (все поля частичные)
export interface UpdateContactsBody {
  companyName?: string;
  legalAddress?: string;
  physicalAddress?: string;
  phones?: IContact["phones"];
  emails?: IContact["emails"];
  socialLinks?: IContact["socialLinks"];
  otherContacts?: IContact["otherContacts"];
  workingHours?: string;
  isActive?: boolean;
}

export type UpdateContactsReq = AuthRequest<
  {},
  ContactsResponse<IContact>,
  UpdateContactsBody,
  {}
>;

export type ToggleActiveReq = AuthRequest<
  {},
  ContactsResponse<{ isActive: boolean }>,
  {},
  {}
>;

// Query для getChangeHistory
export interface ChangeHistoryQuery {
  limit?: string; // на входе строка
}

export type GetChangeHistoryReq = AuthRequest<
  {},
  ContactsResponse<{ changes: unknown[]; total: number }>,
  {},
  ChangeHistoryQuery
>;

// Экспорт vCard – OptionalAuthRequest
export type ExportVCardReq = OptionalAuthRequest<{}, never, {}, {}>;

// Health check – без авторизации
import type { Request } from "express";
export type HealthCheckReq = Request<{}, any, {}, {}>;
