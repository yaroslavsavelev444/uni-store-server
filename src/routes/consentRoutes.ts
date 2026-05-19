import { Router } from "express";

const router = Router();

import consentController from "../controllers/consentController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Публичные роуты (доступны всем)
router.get("/", consentController.list);
router.get("/registration", consentController.getForRegistration);
router.get("/required", consentController.getRequiredForAcceptance);
router.get("/:slug", consentController.getBySlug);

// Защищенные роуты (требуют аутентификации)
router.use(authMiddleware.requireRole("admin"));

// Админские роуты
router.post("/", consentController.create as any);
router.put("/:slug", consentController.update as any);
router.patch("/:slug/activate", consentController.activate as any);
router.patch("/:slug/deactivate", consentController.deactivate as any);
router.delete("/:slug", consentController.delete as any);

export default router;
