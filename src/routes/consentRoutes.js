import { Router } from "express";

const router = Router();

import { activate, create, deactivate, getBySlug, getForRegistration, getRequiredForAcceptance, list, update, delete } from "../controllers/consentController";
import authMiddleware from "../middlewares/auth-middleware";

// Публичные роуты (доступны всем)
router.get("/", list);
router.get("/registration", getForRegistration);
router.get("/required", getRequiredForAcceptance);
router.get("/:slug", getBySlug);

// Защищенные роуты (требуют аутентификации)
router.use(authMiddleware(["admin"]));

// Админские роуты
router.post("/", create);
router.put("/:slug", update);
router.patch("/:slug/activate", activate);
router.patch("/:slug/deactivate", deactivate);
router.delete("/:slug", delete);

export default router;
