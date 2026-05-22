import { Router } from "express";

const router = Router();

import siteMapController from "../controllers/sitemapController.js";

router.get("/", siteMapController.getSitemap as any);

export default router;
