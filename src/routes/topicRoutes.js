const express = require("express");
const router = express.Router();
const infoController = require("../controllers/topicController");
const multerSlugMiddleware = require("../middlewares/multerSlugMiddleware");
const authMiddleware = require("../middlewares/auth-middleware");

// ==== Публичные ====
router.get("/", authMiddleware(["all"]), infoController.getAll);
router.get("/:slug", authMiddleware(["all"]),infoController.getBySlug);

//Статьи
router.post("/admin/create", authMiddleware(["admin"]), multerSlugMiddleware, infoController.create);

router.patch("/admin/:id", authMiddleware(["admin"]), multerSlugMiddleware, infoController.update);

router.delete("/admin/:id", authMiddleware(["admin"]), infoController.delete);

module.exports = router;
