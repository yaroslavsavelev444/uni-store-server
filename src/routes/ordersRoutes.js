// routes/orders.routes.js
import { Router } from "express";

const router = Router();

import ordersController from "../controllers/ordersController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validateCreateOrder } from "../validators/order.validator.js";

// ========== USER ROUTES ==========
router.get("/", authMiddleware("user"), ordersController.getOrders);

router.get("/:id", authMiddleware("user"), ordersController.getOrder);

router.post(
	"/",
	authMiddleware("user"),
	validateCreateOrder, // <-- Добавляем валидатор
	ordersController.createOrder,
);

router.post(
	"/:id/cancel",
	authMiddleware("user"),
	ordersController.cancelOrder,
);

// ========== ADMIN ROUTES ==========
router.get(
	"/admin/orders",
	authMiddleware("admin"),
	ordersController.getAdminOrders,
);

router.get(
	"/admin/orders/:id",
	authMiddleware("admin"),
	ordersController.getAdminOrder,
);

router.patch(
	"/admin/orders/:id/status",
	authMiddleware("admin"),
	ordersController.updateOrderStatus,
);

router.post(
	"/admin/orders/:id/cancel",
	authMiddleware("admin"),
	ordersController.cancelOrderAdmin,
);

router.post(
	"/admin/orders/:id/attachments",
	authMiddleware("admin"),
	ordersController.uploadAttachment,
);

router.delete(
	"/admin/orders/:id/attachments/:fileId",
	authMiddleware("admin"),
	ordersController.deleteAttachment,
);

export default router;
