// routes/admin-user-routes.js
const Router = require("express").Router;
const userController = require("../controllers/usersController");
const authMiddleware = require("../middlewares/auth-middleware");
const { body } = require("express-validator");

const router = new Router();

const adminOnly = authMiddleware.withRoles(["admin", "superadmin"]);

router.get("/", adminOnly, userController.getAllUsers);

router.get("/:userId", adminOnly, userController.getUserById);

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

router.post("/:userId/demote", adminOnly, userController.demoteToUser);

module.exports = router;
