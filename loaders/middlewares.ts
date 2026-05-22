import cookieParser from "cookie-parser";
import cors from "cors";
import type { Application } from "express";
import express from "express";
import { express as useragentExpress } from "express-useragent";
import helmet from "helmet";

import auditConfig from "../config/audit.js";
import corsConfig from "../config/cors.js";

import logger from "../src/logger/logger.js";

import auditRequestMiddleware from "../src/middlewares/audit-request-middleware.js";
import requestContextMiddleware from "../src/middlewares/request-context-middleware.js";

export default (app: Application): void => {
  /**
   * Request context / requestId
   * Должен быть максимально рано
   */
  app.use(requestContextMiddleware);

  /**
   * Security headers
   */
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  /**
   * CORS
   */
  app.use(cors(corsConfig));

  /**
   * Body parsers
   */
  app.use(
    express.json({
      limit: "10mb",
    }),
  );

  app.use(
    express.urlencoded({
      extended: true,
      limit: "10mb",
    }),
  );

  /**
   * Cookies
   */
  app.use(cookieParser());

  /**
   * User-Agent
   */
  app.use(useragentExpress());

  /**
   * Request logging
   */
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.originalUrl} | IP: ${req.ip}`);
    next();
  });

  /**
   * Audit middleware
   * Должен использовать req.body,
   * а не читать stream руками
   */
  app.use(auditRequestMiddleware(auditConfig));
};
