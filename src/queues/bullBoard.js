const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { ExpressAdapter } = require('@bull-board/express');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { taskQueues, moderateQueues
, pushNotificationsQueues } = require('./bull');
const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath('/admin/queues'); // Базовый путь для Bull Board

createBullBoard({
  queues: [new BullAdapter(taskQueues), new BullAdapter(moderateQueues), new BullAdapter(pushNotificationsQueues)],
  serverAdapter,
});

const bullBoardRouter = express.Router();
bullBoardRouter.use(serverAdapter.getRouter());

module.exports = bullBoardRouter;