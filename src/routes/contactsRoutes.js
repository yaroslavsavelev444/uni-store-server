import { Router } from "express";

const router = Router();

import organizationContactController from "../controllers/contactsController";
import authMiddleware from "../middlewares/auth-middleware";
import { validateCreateUpdate } from "../validators/contacts.validator";

// Публичные роуты - получают только активные контакты
router.get("/", organizationContactController.getContacts);
router.get("/export/vcard", organizationContactController.exportVCard);
router.get("/health", organizationContactController.healthCheck);

// Админские роуты - получают любые контакты
router.get(
  "/admin",
  authMiddleware(["admin"]),
  organizationContactController.getAdminContacts,
);
router.put(
  "/admin",
  authMiddleware(["admin"]),
  validateCreateUpdate,
  organizationContactController.updateContacts,
);
router.patch(
  "/admin/toggle-active",
  authMiddleware(["admin"]),
  organizationContactController.toggleActive,
);
router.get(
  "/admin/history",
  authMiddleware(["admin"]),
  organizationContactController.getChangeHistory,
);

export default router;
