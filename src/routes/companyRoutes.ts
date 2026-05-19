// routes/companies.routes.js
import { Router } from "express";

const router = Router();

import companyController from "../controllers/companyController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// ========== USER ROUTES ==========
router.use(authMiddleware.requireRole("user"));
// Создание компании
router.post("/", companyController.createCompany);

// Получение всех компаний пользователя
router.get("/", companyController.getCompanies);

// Получение компании по ID
router.get("/:id", companyController.getCompanyById);

// Получение компании по ИНН
router.get("/tax/:taxNumber", companyController.getCompanyByTaxNumber);

// Обновление компании
router.put("/:id", companyController.updateCompany);

// Удаление компании
router.delete("/:id", companyController.deleteCompany);

// Поиск компаний
router.get("/search", companyController.searchCompanies);

// Получение дефолтной компании
router.get("/default", companyController.getDefaultCompany);

// ========== ADMIN ROUTES ==========

// Синхронизация кеша компаний (админ)
router.post(
  "/sync-cache",
  authMiddleware.requireRole("admin"),
  companyController.syncCache,
);

export default router;
