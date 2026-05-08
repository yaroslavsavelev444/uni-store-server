import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Router } from "express";
import { moderateQueues, pushNotificationsQueues, taskQueues } from "./bull.js";

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath("/admin/queues"); // Базовый путь для Bull Board

createBullBoard({
  queues: [
    new BullAdapter(taskQueues),
    new BullAdapter(moderateQueues),
    new BullAdapter(pushNotificationsQueues),
  ],
  serverAdapter,
});

const bullBoardRouter = express.Router();
bullBoardRouter.use(serverAdapter.getRouter());

module.exports = bullBoardRouter;
