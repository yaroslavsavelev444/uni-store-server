const express = require("express");
const router = express.Router();
const bannerController = require("../controllers/bannerController");
const authMiddleware = require("../middlewares/auth-middleware");

// Публичный роут для пользователей
router.get("/for-user", authMiddleware(['all']), bannerController.getForUser);

// Админские роуты
router.use(authMiddleware(["admin"]));

router.post("/", bannerController.create);
router.put("/:id", bannerController.update);
router.get("/", bannerController.getAll);
router.get("/:id", bannerController.getById);
router.delete("/:id", bannerController.remove);
router.patch("/:id/status", bannerController.changeStatus);

module.exports = router;