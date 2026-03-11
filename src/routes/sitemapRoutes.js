import { Router } from "express";

const router = Router();

import { getSitemap } from "../controllers/sitemapController.js";

router.get("/", getSitemap);

export default router;
