import { EventEmitter } from "node:events";

EventEmitter.defaultMaxListeners = 20;

import { createServer } from "node:http";

import app from "./app";
import { HOST, NODE_ENV, PORT } from "./config/env";
import { connectDB } from "./src/config/mongo";
import { initialize } from "./src/cron";
import { error, info } from "./src/logger/logger";

const server = createServer(app);

(async () => {
	try {
		await connectDB();
		initialize();

		server.listen(PORT, HOST, () => {
			info(`Server (${NODE_ENV}) running on http://${HOST}:${PORT}`);
		});
	} catch (err) {
		error(`Fatal startup error: ${err.message}`);
		process.exit(1);
	}
})();
