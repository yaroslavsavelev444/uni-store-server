import { Router } from "express";

const router = Router();

import { getSitemap } from "../controllers/sitemapController";

router.get("/", getSitemap);

export default router;
