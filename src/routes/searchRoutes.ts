import { Router } from "express";

const router = Router();

import searchController from "../controllers/searchController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// const validateQueryParams = require("../middlewares/validateQueryParams");
router.get("/getHints", searchController.getHints as any);

// Все маршруты требуют аутентификации
router.use(authMiddleware.requireAuth());

// История поиска
router.post("/saveSearchHistory", searchController.saveSearchHistory as any);
router.get("/getSearchHistory", searchController.getSearchHistory as any);
router.post("/clearSearchHistory", searchController.clearSearchHistory as any);

export default router;
