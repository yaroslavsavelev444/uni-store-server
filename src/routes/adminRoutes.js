const express = require("express");
const router = express.Router();
const upload = require("../middleware/multerMiddleware"); // Место, где мы подключаем multer
const edit = require("../middleware/uploadProductForEdit"); // Место, где мы подключаем multer
const adminController = require("../controllers/adminController");
const orgEdit = require("../middleware/uploadOrgLogoForEdit");
const uploadOrgFiles = require("../middleware/uploadOrgFiles");
const { uploadSocialIcons } = require("../middleware/uploadIcons");
const uploadOrderFile = require("../middleware/uploadOrderFile");

// ПРОДУКТ
router.post(
  "/addProduct",
  upload.uploadProduct.fields([
    { name: "instruction", maxCount: 1 },
    { name: "images", maxCount: 10 }
  ]),
  adminController.createProduct
);

router.post(
  "/editProduct/:id",
  edit.uploadProductForEdit.fields([
    { name: "instruction", maxCount: 1 },
    { name: "images", maxCount: 10 }
  ]),
  adminController.editProduct
);

router.delete("/deleteProduct", adminController.deleteProduct);

//КАТЕГОРИИ
router.post(
  "/addCategory",
  upload.uploadCategory.single("image"),
  adminController.createCategory
);

router.put(
  "/editCategory/:id",
  upload.uploadCategory.single("image"),
  adminController.updateCategory
);
router.delete("/deleteCategory/:id", adminController.deleteCategory);

//КОМПАНИЯ 
router.post("/addOrgData", upload.uploadOrgLogo.single("image"), adminController.uploadOrgData);
router.put("/editOrgData", orgEdit.uploadOrgLogoForEdit.single("image"), adminController.editOrgData);
router.delete("/deleteOrgData/:id", adminController.deleteOrgData);
router.post("/uploadOrgFiles/:orgId", uploadOrgFiles, adminController.uploadOrgFiles);
router.post("/deleteOrgFile/:orgId", adminController.deleteOrgFile);
router.post("/addOrgSocialLinks/:orgId", uploadSocialIcons, adminController.addOrgSocialLinks);
//ПОЛЬЗОВАТЕЛИ
router.post("/toggleAdminRules", adminController.toggleAssignAdminRules);
router.get("/getUsers", adminController.getUsers);
router.delete("/deleteUser", adminController.deleteUser);


//ОТЗЫВЫ 
router.get("/getReviews", adminController.getReviews);
router.post("/updateReviewStatus/:id", adminController.updateReviewStatus);

//КОММентР
router.post("/updateOrgReviewStatus/:id", adminController.updateOrgReviewStatus);
router.get("/getOrgReviews", adminController.getOrgReviews);

//КОНТАКТЫ 
router.get("/getContacts", adminController.getContacts);
router.post("/updateContactStatus", adminController.updateContactStatus);

//ЗАКАЗЫ
router.get("/getOrders", adminController.getOrders);
router.post("/cancelOrder", adminController.cancelOrder);
router.patch("/updateOrderStatus", adminController.updateOrderStatus);
router.post("/uploadOrderFile/:orderId", uploadOrderFile, adminController.uploadOrderFile);
router.delete("/deleteOrderFile/:orderId", adminController.deleteOrderFile);
router.delete("/deleteUploadedFile", adminController.deleteUploadedFile);
router.post("/changeCategoryData", adminController.changeCategoryData);
router.post("/clearCategory", adminController.clearCategory);

module.exports = router;
