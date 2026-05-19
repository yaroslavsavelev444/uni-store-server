// routes/delivery.routes.js
import { Router } from "express";

const router = Router();

import pickupPointController from "../controllers/pickupPointController.js";
import transportCompanyController from "../controllers/transportCompanyController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Публичные роуты
router.get("/pickup-points", pickupPointController.getPickupPoints);
router.get("/pickup-points/main", pickupPointController.getMainPickupPoint);
router.get("/pickup-points/:id", pickupPointController.getPickupPoint);
// ========== TRANSPORT COMPANIES ROUTES ==========

// Для пользователя
router.get("/transport-companies/active", transportCompanyController.getActive);

router.use(authMiddleware.requireRole("admin"));
// Админские роуты
router.post("/pickup-points", pickupPointController.createPickupPoint as any);

router.put(
  "/pickup-points/:id",
  pickupPointController.updatePickupPoint as any,
);

router.delete(
  "/pickup-points/:id",
  pickupPointController.deletePickupPoint as any,
);

router.patch(
  "/pickup-points/:id/toggle-status",
  pickupPointController.togglePickupPointStatus as any,
);

router.patch(
  "/pickup-points/:id/set-main",
  pickupPointController.setAsMainPickupPoint as any,
);

router.put(
  "/pickup-points/order",
  pickupPointController.updatePickupPointsOrder as any,
);
// Для админа
router.get("/transport-companies/", transportCompanyController.getAll as any);
router.post("/transport-companies/", transportCompanyController.create as any);
router.put(
  "/transport-companies/:id",
  transportCompanyController.update as any,
);
router.delete(
  "/transport-companies/:id",
  transportCompanyController.delete as any,
);

export default router;
