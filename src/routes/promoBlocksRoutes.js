const express = require("express");
const router = express.Router();

const promoBlocksController = require("../controllers/promoBlocksController");

router.get("/getPromoBlocks", promoBlocksController.getPromoBlocks);
router.get("/getMainMaterials", promoBlocksController.getMainMaterials);

// router.post("/editPromoBlock/:id", adminController.editPromoBlock);
// router.delete("/deletePromoBlock/:id", adminController.deletePromoBlock);

module.exports = router;