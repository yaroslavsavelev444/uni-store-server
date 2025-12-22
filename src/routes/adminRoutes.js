const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// ============== USERS (Пользователи) ==============
router.get("/users", adminController.getUsers);
router.patch("/users/:id/role", adminController.updateUserRole);
router.delete("/users/:id", adminController.deleteUser);

// ============== PROMOTIONS (Промо-материалы) ==============
// Промо-блоки
// router.post("/promo-blocks", adminController.createPromoBlock);
// router.get("/promo-blocks", adminController.getPromoBlocks);
router.get("/promo-blocks/:id", adminController.getPromoBlock);
router.put("/promo-blocks/:id", adminController.updatePromoBlock);
router.delete("/promo-blocks/:id", adminController.deletePromoBlock);

// Главные материалы
// router.post("/main-materials", adminController.createMainMaterial);
// router.get("/main-materials", adminController.getMainMaterials);
// router.get("/main-materials/:id", adminController.getMainMaterial);
router.put("/main-materials/:id", adminController.updateMainMaterial);
router.delete("/main-materials/:id", adminController.deleteMainMaterial);

// ============== UPLOADED FILES (Загруженные файлы) ==============
router.delete("/files/:fileId", adminController.deleteUploadedFile);

module.exports = router;