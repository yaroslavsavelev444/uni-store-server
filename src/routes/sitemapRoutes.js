const express = require('express');
const router = express.Router();
const sitemapController = require("../controllers/sitemapController");

router.get("/", sitemapController.getSitemap);

module.exports = router;