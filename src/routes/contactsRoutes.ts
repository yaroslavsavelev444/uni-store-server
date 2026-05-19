import { Router } from "express";

const router = Router();

import organizationContactController from "../controllers/contactsController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import validator from "../middlewares/validators.js";

// Публичные роуты - получают только активные контакты
router.get("/", organizationContactController.getContacts);
router.get("/export/vcard", organizationContactController.exportVCard);
router.get("/health", organizationContactController.healthCheck);

// Админские роуты - получают любые контакты
router.get(
  "/admin",
  authMiddleware.requireRole("admin"),
  organizationContactController.getAdminContacts,
);
router.put(
  "/admin",
  authMiddleware.requireRole("admin"),
  validator.validateCreateUpdate,
  organizationContactController.updateContacts,
);
router.patch(
  "/admin/toggle-active",
  authMiddleware.requireRole(["admin"]),
  organizationContactController.toggleActive,
);
router.get(
  "/admin/history",
  authMiddleware.requireRole("admin"),
  organizationContactController.getChangeHistory,
);

export default router;
