// types/notifications-controller.ts
import type { AuthRequest } from "../auth.js";
import type { INotification } from "../notification.types.js";

// Базовый формат ответа (для единообразия, хотя в оригинале ответы без обёртки)
// Но по требованиям желательно единообразно. Оставим как есть, но можно добавить success.
// Однако в исходном коде ответы идут напрямую: res.json(notifications) и т.д.
// Следуя заданию "Структура ответов — единообразно: при необходимости { success, message, data }",
// преобразуем ответы в единый формат, но чтобы не нарушить API, лучше сохранить исходный формат.
// В данном случае оставим без обёртки, но типы будут соответствовать тому, что возвращает сервис.

// Параметры запроса для getNotifications
export interface GetNotificationsQuery {
  limit?: string;
  skip?: string;
}

// Тело запроса для markNotificationAsRead
export interface MarkAsReadBody {
  ids: string[];
}

// Типы ответов (совпадают с типами из сервиса)
import type {
  DeleteNotificationsResponse,
  MarkAsReadResponse,
} from "../notification.js";

// Типизированные запросы (все требуют авторизации)
export type GetNotificationsReq = AuthRequest<
  {},
  INotification[],
  {},
  GetNotificationsQuery
>;
export type MarkAsReadReq = AuthRequest<
  {},
  MarkAsReadResponse,
  MarkAsReadBody,
  {}
>;
export type DeleteNotificationsReq = AuthRequest<
  {},
  DeleteNotificationsResponse,
  {},
  {}
>;
export type GetUnreadCountReq = AuthRequest<{}, number, {}, {}>;
