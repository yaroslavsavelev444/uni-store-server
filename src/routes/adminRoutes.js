import { Router } from "express";

const router = Router();

import {
	deleteMainMaterial,
	deletePromoBlock,
	deleteUploadedFile,
	deleteUser,
	getPromoBlock,
	getUsers,
	updateMainMaterial,
	updatePromoBlock,
	updateUserRole,
} from "../controllers/adminController";

// ============== USERS (Пользователи) ==============
router.get("/users", getUsers);
router.patch("/users/:id/role", updateUserRole);
router.delete("/users/:id", deleteUser);

// ============== PROMOTIONS (Промо-материалы) ==============
// Промо-блоки
// router.post("/promo-blocks", adminController.createPromoBlock);
// router.get("/promo-blocks", adminController.getPromoBlocks);
router.get("/promo-blocks/:id", getPromoBlock);
router.put("/promo-blocks/:id", updatePromoBlock);
router.delete("/promo-blocks/:id", deletePromoBlock);

// Главные материалы
// router.post("/main-materials", adminController.createMainMaterial);
// router.get("/main-materials", adminController.getMainMaterials);
// router.get("/main-materials/:id", adminController.getMainMaterial);
router.put("/main-materials/:id", updateMainMaterial);
router.delete("/main-materials/:id", deleteMainMaterial);

// ============== UPLOADED FILES (Загруженные файлы) ==============
router.delete("/files/:fileId", deleteUploadedFile);

export default router;
