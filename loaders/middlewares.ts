// src/loaders/expressLoader.ts

import pkg from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Application } from "express";
import { json } from "express";
import expressUseragent from "express-useragent";
import helmet from "helmet";
import auditConfig from "../config/audit.js";
import corsConfig from "../config/cors.js";
import logger from "../src/logger/logger.js";
import auditRequestMiddleware from "../src/middlewares/audit-request-middleware.js";
import requestContextMiddleware from "../src/middlewares/request-context-middleware.js";

const { urlencoded } = pkg;

/**
 * Настройка middleware для Express приложения
 * @param app - экземпляр Express приложения
 */
export default (app: Application): void => {
  // Helmet – защита HTTP заголовков
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  // CORS
  app.use(cors(corsConfig));

  // Парсинг JSON и URL-encoded тел запросов
  app.use(json({ limit: "100mb" }));
  app.use(urlencoded({ extended: true, limit: "100mb" }));

  // Cookie парсер
  app.use(cookieParser());

  // User-Agent парсер
  app.use(expressUseragent.express());

  // Логирование каждого запроса (IP, метод, URL)
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.url} | IP: ${req.ip}`);
    next();
  });

  // Контекст запроса (requestId, correlationId и т.д.)
  app.use(requestContextMiddleware);

  // Аудит запросов (логирование действий)
  app.use(auditRequestMiddleware(auditConfig));
};
