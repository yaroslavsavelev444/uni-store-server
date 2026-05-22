// routes/orders.routes.js
import { Router } from "express";

const router = Router();

import ordersController from "../controllers/ordersController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validateCreateOrder } from "../validators/order.validator.js";

// ========== USER ROUTES ==========
router.get(
  "/",
  authMiddleware.requireRole("all"),
  ordersController.getOrders as any,
);

router.get(
  "/:id",
  authMiddleware.requireRole("all"),
  ordersController.getOrder as any,
);

router.post(
  "/",
  authMiddleware.requireRole("all"),
  validateCreateOrder,
  ordersController.createOrder as any,
);

router.post(
  "/:id/cancel",
  authMiddleware.requireRole("all"),
  ordersController.cancelOrder as any,
);

// ========== ADMIN ROUTES ==========
router.get(
  "/admin/orders",
  authMiddleware.requireRole("admin"),
  ordersController.getAdminOrders as any,
);

router.get(
  "/admin/orders/:id",
  authMiddleware.requireRole("admin"),
  ordersController.getAdminOrder as any,
);

router.patch(
  "/admin/orders/:id/status",
  authMiddleware.requireRole("admin"),
  ordersController.updateOrderStatus as any,
);

router.post(
  "/admin/orders/:id/cancel",
  authMiddleware.requireRole("admin"),
  ordersController.cancelOrderAdmin as any,
);

router.post(
  "/admin/orders/:id/attachments",
  authMiddleware.requireRole("admin"),
  ordersController.uploadAttachment as any,
);

router.delete(
  "/admin/orders/:id/attachments/:fileId",
  authMiddleware.requireRole("admin"),
  ordersController.deleteAttachment as any,
);

export default router;
