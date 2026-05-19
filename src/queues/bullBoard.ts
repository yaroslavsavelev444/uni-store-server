import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Router } from "express";
import { moderateQueues, pushNotificationsQueues, taskQueues } from "./bull.js";

// Создаём адаптер для Express
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

// Создаём Bull Board с адаптерами очередей
createBullBoard({
  queues: [
    new BullAdapter(taskQueues),
    new BullAdapter(moderateQueues),
    new BullAdapter(pushNotificationsQueues),
  ],
  serverAdapter,
});

// Создаём роутер и подключаем middleware Bull Board
const bullBoardRouter = Router();
bullBoardRouter.use(serverAdapter.getRouter());

export default bullBoardRouter;
