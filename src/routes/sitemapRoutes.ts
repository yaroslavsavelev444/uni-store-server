const express = require("express");
const router = express.Router();
const sitemapController = require("../controllers/sitemapController");

router.get("/", sitemapController.getSitemap);

import { getSitemap } from "../controllers/sitemapController.js";

router.get("/", getSitemap);

export default router;
