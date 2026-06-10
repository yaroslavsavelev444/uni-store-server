// routes/feed.routes.ts

import express from "express";
import feedController from "../controllers/feedController.js";

const router = express.Router();

router.get("/", feedController.getYmlFeed as any);

export default router;
