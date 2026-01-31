const events = require("events");
events.EventEmitter.defaultMaxListeners = 20;

const http = require("http");

const app = require("./app");
const { connectDB } = require("./src/config/mongo");
const cronInit = require("./src/cron");
const logger = require("./src/logger/logger");
const { PORT, HOST, NODE_ENV } = require("./config/env");

const server = http.createServer(app);

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