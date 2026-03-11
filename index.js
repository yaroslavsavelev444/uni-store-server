import { EventEmitter } from "node:events";

EventEmitter.defaultMaxListeners = 20;

import { createServer } from "node:http";

import app from "./app.js";
import { HOST, NODE_ENV, PORT } from "./config/env";
import { connectDB } from "./src/config/mongo";
import cronInit from "./src/cron";
import logger from "./src/logger/logger";

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
