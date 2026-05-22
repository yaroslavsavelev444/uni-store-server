import { Router } from "express";

const router = Router();

import discountController from "../controllers/discountController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// Валидационные схемы (если используете Joi или аналоги)
// const discountValidation = require("../validations/discount-validation");

// Публичные роуты (для применения скидок к корзине)
router.post("/calculate", discountController.getForCart);

// Админские роуты (требуют авторизации и роли admin)
router.use(authMiddleware(["admin"]));

// CRUD операции для скидок
router.post("/", discountController.create as any);
router.put("/:id", discountController.update as any);
router.get("/", discountController.getAll as any);
router.get("/:id", discountController.getById);
router.delete("/:id", discountController.remove as any);
router.patch("/:id/status", discountController.changeStatus as any);

export default router;
