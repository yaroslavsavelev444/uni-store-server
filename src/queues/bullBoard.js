import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/dist/queueAdapters/bull.js"; // ИЗМЕНЕНО
import { ExpressAdapter } from "@bull-board/express";
import express from "express";
import bull from "./bull.js";

const { taskQueues, moderateQueues, pushNotificationsQueues } = bull;

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

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

export default bullBoardRouter;
