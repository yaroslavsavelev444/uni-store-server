const express = require("express");
const router = express.Router();
const upload = require("../middleware/multerMiddleware"); // Место, где мы подключаем multer
const edit = require("../middleware/uploadProductForEdit"); // Место, где мы подключаем multer
const adminController = require("../controllers/adminController");
const { uploadOrgLogoForEdit } = require("../middleware/uploadOrgLogoForEdit");
const orgEdit = require("../middleware/uploadOrgLogoForEdit");

// Роут для добавления продукта
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

router.post("/archieveProduct", adminController.archieveProduct);
router.delete("/deleteProduct", adminController.deleteProduct);
router.post("/updateProductData", upload.uploadCategory.single("image"), adminController.updateProductData);
router.post("/toggleAssignAdminRules", adminController.toggleAssignAdminRules);
router.get("/getUsers", adminController.getUsers);
router.delete("/deleteUser", adminController.deleteUser);

router.post("/changeStatusOrder", adminController.changeStatusOrder);
router.post("/uploadProductFile", upload.uploadCategory.single("image"), adminController.uploadProductFile);
router.post("/uploadOrderFile", upload.uploadCategory.single("image"), adminController.uploadOrderFile);
router.delete("/deleteUploadedFile", adminController.deleteUploadedFile);
router.post("/changeCategoryData", adminController.changeCategoryData);
router.post("/clearCategory", adminController.clearCategory);
router.delete("/deleteContact", adminController.deleteContact);

module.exports = router;
