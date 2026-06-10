// controllers/feedController.ts

import type { NextFunction, Request, Response } from "express";
import ymlFeedService from "../services/ymlFeedService.js";

class FeedController {
  getYmlFeed = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const xml = await ymlFeedService.generateYandexFeed();

      res.setHeader("Content-Type", "application/xml; charset=utf-8");

      res.send(xml);
    } catch (e) {
      next(e);
    }
  };
}

export default new FeedController();
