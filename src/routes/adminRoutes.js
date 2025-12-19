const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// ============== PRODUCTS (Продукты) ==============
router.post("/products", adminController.createProduct);
// router.delete("/products/:id", adminController.deleteProduct); //TODO аривируем вместо удаления 

// ============== CATEGORIES (Категории) ==============
router.post("/categories", adminController.createCategory);
router.put("/categories/:id", adminController.updateCategory);
router.delete("/categories/:id", adminController.deleteCategory);

// ============== ORGANIZATION (Компания) ==============
router.post("/organization", adminController.createOrganization);
router.put("/organization/:id", adminController.updateOrganization);
router.delete("/organization/:id", adminController.deleteOrganization);

// Файлы организации
router.post("/organization/:id/files", adminController.uploadOrganizationFile);
router.delete("/organization/:id/files/:fileId", adminController.deleteOrganizationFile);

// Социальные ссылки
router.post("/organization/:id/social-links", adminController.addSocialLink);
router.delete("/organization/:id/social-links/:linkId", adminController.deleteSocialLink);

// ============== USERS (Пользователи) ==============
router.get("/users", adminController.getUsers);
router.patch("/users/:id/role", adminController.updateUserRole);
router.delete("/users/:id", adminController.deleteUser);

// ============== REVIEWS (Отзывы) ==============
// Отзывы на продукты
router.get("/reviews", adminController.getProductsReviews);
router.get("/reviews/:id", adminController.getProductReviews);
router.patch("/reviews/:id/status", adminController.updateReviewStatus);
// router.delete("/reviews/:id", adminController.deleteReview); //TODO аривируем вместо удаления

// Отзывы на организацию
router.get("/organization-reviews", adminController.getOrgReviews);
router.patch("/organization-reviews/:id/status", adminController.updateOrgReviewStatus);

// ============== CONTACTS (Контакты) ==============
// router.patch("/contacts/:id/status", adminController.updateContact);
// router.delete("/contacts/:id", adminController.deleteContact);

// ============== ORDERS (Заказы) ==============
router.get("/orders", adminController.getOrders);
// router.get("/orders/:id", adminController.getOrder);
router.patch("/orders/:id/status", adminController.updateOrderStatus);
router.patch("/orders/:id/cancel", adminController.cancelOrder);
// router.delete("/orders/:id", adminController.deleteOrder);

// Файлы заказа
router.post("/orders/:id/files", adminController.uploadOrderFile);
router.delete("/orders/:id/files/:fileId", adminController.deleteOrderFile);

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