import { EventEmitter } from "node:events";

EventEmitter.defaultMaxListeners = 20;

import { createServer } from "node:http";

import app from "./app.js";
import env from "./config/env.js";

const { NODE_ENV, PORT, HOST } = env;

import mongo from "./src/config/mongo.js";

const { connectDB } = mongo;

import cronInit from "./src/cron/index.js";
import logger from "./src/logger/logger.js";

const server = createServer(app);

(async () => {
  try {
    await connectDB();
    cronInit.initialize();

    server.listen(PORT, HOST, () => {
      logger.info(`Server (${NODE_ENV}) running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    logger.error(`Fatal startup error: ${err.message}`);
    process.exit(1);
  }
})();
