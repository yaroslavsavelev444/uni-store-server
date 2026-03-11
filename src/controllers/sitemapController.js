// src/controllers/sitemapController.js
import { getXml } from "../services/sitemapService.js";

export async function getSitemap(req, res, next) {
	try {
		const xml = await getXml();

		res.setHeader("Content-Type", "application/xml; charset=utf-8");
		res.setHeader("Cache-Control", "public, max-age=300"); // браузерный кеш
		res.status(200).send(xml);
	} catch (e) {
		next(e);
	}
}
