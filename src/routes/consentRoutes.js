import { Router } from "express";

const router = Router();

import {
  activate,
  create,
  deactivate,
  deleteConsentController,
  getBySlug,
  getForRegistration,
  getRequiredForAcceptance,
  list,
  update,
} from "../controllers/consentController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Публичные роуты (доступны всем)
router.get("/", consentController.list);
router.get("/registration", consentController.getForRegistration);
router.get("/required", consentController.getRequiredForAcceptance);
router.get("/:slug", consentController.getBySlug);

// Защищенные роуты (требуют аутентификации)
router.use(authMiddleware(["admin"]));

// Админские роуты
router.post("/", create);
router.put("/:slug", update);
router.patch("/:slug/activate", activate);
router.patch("/:slug/deactivate", deactivate);
router.delete("/:slug", deleteConsentController);

module.exports = router;
