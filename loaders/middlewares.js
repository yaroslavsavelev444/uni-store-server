import { urlencoded } from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import { json } from "express";
import { express as _express } from "express-useragent";
import helmet from "helmet";
import auditConfig from "../config/audit";
import corsConfig from "../config/cors";
import logger from "../src/logger/logger";
import auditRequestMiddleware from "../src/middlewares/audit-request-middleware";
import requestContextMiddleware from "../src/middlewares/request-context-middleware";

export default (app) => {
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  app.use(cors(corsConfig));
  app.use(json({ limit: "100mb" }));
  app.use(urlencoded({ extended: true, limit: "100mb" }));
  app.use(cookieParser());
  app.use(_express());

  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} | IP: ${req.ip}`);
    next();
  });

  app.use(requestContextMiddleware);
  app.use(auditRequestMiddleware(auditConfig));
};
