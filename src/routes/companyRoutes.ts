// routes/companies.routes.js
import { Router } from "express";

const router = Router();

import companyController from "../controllers/companyController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// ========== USER ROUTES ==========
router.use(authMiddleware.requireRole("user"));
// Создание компании
router.post("/", companyController.createCompany as any);

// Получение всех компаний пользователя
router.get("/", companyController.getCompanies as any);

// Получение компании по ID
router.get("/:id", companyController.getCompanyById as any);

// Получение компании по ИНН
router.get("/tax/:taxNumber", companyController.getCompanyByTaxNumber as any);

// Обновление компании
router.put("/:id", companyController.updateCompany as any);

// Удаление компании
router.delete("/:id", companyController.deleteCompany as any);

// Поиск компаний
router.get("/search", companyController.searchCompanies as any);

// Получение дефолтной компании
router.get("/default", companyController.getDefaultCompany as any);

// ========== ADMIN ROUTES ==========

// Синхронизация кеша компаний (админ)
router.post(
  "/sync-cache",
  authMiddleware.requireRole("admin"),
  companyController.syncCache as any,
);

export default router;
