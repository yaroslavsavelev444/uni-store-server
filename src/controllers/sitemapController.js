// src/controllers/sitemapController.js
const sitemapService = require("../services/sitemapService");

exports.getSitemap = async (req, res, next) => {
  try {
    const xml = await sitemapService.getXml();

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300"); // браузерный кеш
    res.status(200).send(xml);
  } catch (e) {
    next(e);
  }
};