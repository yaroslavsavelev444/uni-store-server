const express = require("express");
const router = express.Router();
const ContentBlockController = require("../controllers/contentBlockController");
const authMiddleware = require("../middlewares/auth-middleware");
const validate = require("../middlewares/validation-middleware");
const { contentBlockSchema, idSchema, updateSchema } = require("../validators/contentBlock.validator");

// Инициализация контроллера
const contentBlockController = new ContentBlockController();

// ==== Публичные маршруты ====
router.get("/", contentBlockController.getAll.bind(contentBlockController));
router.get("/stats", contentBlockController.getStats.bind(contentBlockController));
router.get("/tag/:tag", contentBlockController.getByTag.bind(contentBlockController));
router.get("/:id", validate(idSchema, 'params'), contentBlockController.getById.bind(contentBlockController));

// ==== Административные маршруты ====
router.post(
  "/",
  authMiddleware(["admin"]),
  validate(contentBlockSchema),
  contentBlockController.create.bind(contentBlockController)
);

router.patch(
  "/:id",
  authMiddleware(["admin"]),
  validate(idSchema, 'params'),
  validate(updateSchema),
  contentBlockController.update.bind(contentBlockController)
);

router.delete(
  "/:id",
  authMiddleware(["admin"]),
  validate(idSchema, 'params'),
  contentBlockController.delete.bind(contentBlockController)
);

router.patch(
  "/:id/toggle-active",
  authMiddleware(["admin"]),
  validate(idSchema, 'params'),
  contentBlockController.toggleActive.bind(contentBlockController)
);

module.exports = router;