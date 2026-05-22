import { EventEmitter } from "node:events";

EventEmitter.defaultMaxListeners = 20;

import { createServer } from "node:http";

import app from "./app.js";
import { HOST, NODE_ENV, PORT } from "./config/env.js";
import { connectDB } from "./src/config/mongo.js";
// import cron from "./src/cron/index.js";
import logger from "./src/logger/logger.js";

const server = createServer(app);

(async () => {
  try {
    await connectDB();
    // cron.initialize();

    server.listen(PORT, HOST, () => {
      logger.info(`Server (${NODE_ENV}) running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`Fatal startup error: ${errorMessage}`);
    process.exit(1);
  }
})();
