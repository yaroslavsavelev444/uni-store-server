const express = require("express");
const router = express.Router();
const discountController = require("../controllers/discountController");
const authMiddleware = require("../middlewares/auth-middleware");
const validateMiddleware = require("../middlewares/validation-middleware");

// Валидационные схемы (если используете Joi или аналоги)
// const discountValidation = require("../validations/discount-validation");

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

module.exports = router;