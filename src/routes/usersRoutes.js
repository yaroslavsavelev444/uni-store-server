// routes/admin-user-routes.js
const Router = require("express").Router;
const userController = require("../controllers/usersController");
const authMiddleware = require("../middlewares/auth-middleware");
const { body } = require("express-validator");
const mongoose = require("mongoose");

const router = new Router();

const adminOnly = authMiddleware.withRoles(["admin", "superadmin"]);

// Получение всех пользователей
router.get("/", adminOnly, userController.getAllUsers);

// Поиск пользователей (новый эндпоинт)
router.get("/search", adminOnly, userController.searchUsers);

// Получение пользователя по ID
router.get("/:userId", adminOnly, userController.getUserById);

// Получение детальной информации о пользователе
router.get("/:userId/details", adminOnly, userController.getUserDetails);

// Обновление роли пользователя
router.patch(
  "/:userId/role",
  adminOnly,
  [
    body("role")
      .isString()
      .isIn(["user", "admin", "superadmin"])
      .withMessage(
        "Роль должна быть одним из значений: user, admin, superadmin"
      ),
  ],
  userController.updateUserRole
);

// Понижение до пользователя
router.post("/:userId/demote", adminOnly, userController.demoteToUser);

// Блокировка пользователя
router.post(
  "/:userId/block",
  adminOnly,
  [
    body("duration")
      .isInt({ min: 0 })
      .withMessage("Длительность блокировки должна быть числом (0 для бессрочной)"),
    body("reason")
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage("Причина блокировки не должна превышать 500 символов"),
    body("type")
      .optional()
      .isIn(["block", "warning", "restriction"])
      .withMessage("Тип санкции должен быть одним из: block, warning, restriction"),
  ],
  userController.blockUser
);

// Разблокировка пользователя
router.post("/:userId/unblock", adminOnly, userController.unblockUser);

// Получение истории санкций
router.get("/:userId/sanctions", adminOnly, userController.getUserSanctions);

// Получение статуса блокировки
router.get("/:userId/block-status", adminOnly, userController.getBlockStatus);

module.exports = router;