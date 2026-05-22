import { Router } from "express";
import contentBlockController from "../controllers/contentBlockController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { validate } from "../middlewares/validators.js";
import {
  contentBlockSchema,
  idSchema,
  updateSchema,
} from "../validators/contentBlock.validator.js";

const router = Router();

// ===== Публичные маршруты (без авторизации) =====
router.get("/", contentBlockController.getAll as any);
router.get("/stats", contentBlockController.getStats);
router.get("/tag/:tag", contentBlockController.getByTag);
router.get(
  "/:id",
  validate(idSchema, "params"),
  contentBlockController.getById as any,
);

// ===== Административные маршруты (только admin) =====
router.post(
  "/",
  authMiddleware(["admin"]),
  validate(contentBlockSchema),
  contentBlockController.create as any,
);

router.patch(
  "/:id",
  authMiddleware(["admin"]),
  validate(idSchema, "params"),
  validate(updateSchema),
  contentBlockController.update as any,
);

router.delete(
  "/:id",
  authMiddleware(["admin"]),
  validate(idSchema, "params"),
  contentBlockController.delete as any,
);

router.patch(
  "/:id/toggle-active",
  authMiddleware(["admin"]),
  validate(idSchema, "params"),
  contentBlockController.toggleActive as any,
);

export default router;
