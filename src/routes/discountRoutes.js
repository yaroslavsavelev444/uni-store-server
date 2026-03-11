import { Router } from "express";

const router = Router();

import discountController from "../controllers/discountController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Валидационные схемы (если используете Joi или аналоги)

// Публичные роуты (для применения скидок к корзине)
router.post("/calculate", discountController.getForCart);

// Админские роуты (требуют авторизации и роли admin)
router.use(authMiddleware(["admin"]));

// CRUD операции для скидок
router.post("/", discountController.create);
router.put("/:id", discountController.update);
router.get("/", discountController.getAll);
router.get("/:id", discountController.getById);
router.delete("/:id", discountController.remove);
router.patch("/:id/status", discountController.changeStatus);

export default router;
