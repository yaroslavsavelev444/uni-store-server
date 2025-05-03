const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { ExpressAdapter } = require('@bull-board/express');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { emailQueues, logQueues, errorLogQueues } = require('./bull');
const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath('/admin/queues'); // Базовый путь для Bull Board

createBullBoard({
  queues: [new BullAdapter(emailQueues), new BullAdapter(logQueues), new BullAdapter(errorLogQueues)],
  serverAdapter,
});

const bullBoardRouter = express.Router();
bullBoardRouter.use(serverAdapter.getRouter());

module.exports = bullBoardRouter;