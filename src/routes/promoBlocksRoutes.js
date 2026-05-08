import { Router } from "express";

const router = Router();

import promoBlocksController from "../controllers/promoBlocksController.js";

router.get("/getPromoBlocks", promoBlocksController.getPromoBlocks);
router.get("/getMainMaterials", promoBlocksController.getMainMaterials);

// router.post("/editPromoBlock/:id", adminController.editPromoBlock);
// router.delete("/deletePromoBlock/:id", adminController.deletePromoBlock);

export default router;
