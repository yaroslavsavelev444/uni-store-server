import type { Request } from "express";

/**
 * Запрос к эндпоинту /sitemap.xml
 * (не требует авторизации, без параметров URL/query/body)
 */
export type GetSitemapReq = Request<{}, string, {}, {}>;

// Ответом является XML-строка, отправляемая через res.send()
// Тип ответа не используется в коде, но может быть полезен для документации.
export type GetSitemapRes = string;
