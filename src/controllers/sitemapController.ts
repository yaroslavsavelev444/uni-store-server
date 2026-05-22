import type { NextFunction, Response } from "express";
import { getXml } from "../services/sitemapService.js";
import type { GetSitemapReq } from "../types/controllers/sitemap-controller.js";

class SitemapController {
  /**
   * Генерирует и отдаёт XML-карту сайта (публичный эндпоинт)
   */
  getSitemap = async (
    req: GetSitemapReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const xml = await getXml();

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.status(200).send(xml);
    } catch (error) {
      next(error);
    }
  };
}

export default new SitemapController();
