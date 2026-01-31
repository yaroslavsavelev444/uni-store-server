const helmet = require("helmet");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const useragent = require("express-useragent");
const express = require("express");
const corsConfig = require("../config/cors");
const logger = require("../src/logger/logger");

const requestContextMiddleware = require("../src/middlewares/request-context-middleware");
const auditRequestMiddleware = require("../src/middlewares/audit-request-middleware");
const auditConfig = require("../config/audit");

module.exports = (app) => {
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    })
  );

  app.use(cors(corsConfig));
  app.use(express.json({ limit: "100mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));
  app.use(cookieParser());
  app.use(useragent.express());

  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} | IP: ${req.ip}`);
    next();
  });

  app.use(requestContextMiddleware);
  app.use(auditRequestMiddleware(auditConfig));
};