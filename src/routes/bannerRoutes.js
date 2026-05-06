import { Router } from "express";

const router = Router();

import {
	changeStatus,
	create,
	getAll,
	getById,
	getForUser,
	remove,
	update,
} from "../controllers/bannerController";
import authMiddleware from "../middlewares/auth-middleware";

// Публичный роут для пользователей
router.get("/for-user", authMiddleware(["all"]), getForUser);

// Админские роуты
router.use(authMiddleware(["admin"]));

router.post("/", create);
router.put("/:id", update);
router.get("/", getAll);
router.get("/:id", getById);
router.delete("/:id", remove);
router.patch("/:id/status", changeStatus);

export default router;
