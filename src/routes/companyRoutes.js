// routes/companies.routes.js
import { Router } from "express";

const router = Router();

import companyController from "../controllers/companyController.js";
import authMiddleware from "../middlewares/auth-middleware.js";

// ========== USER ROUTES ==========

// Создание компании
router.post("/", authMiddleware("user"), companyController.createCompany);

// Получение всех компаний пользователя
router.get("/", authMiddleware("user"), companyController.getCompanies);

// Получение компании по ID
router.get("/:id", authMiddleware("user"), companyController.getCompanyById);

// Получение компании по ИНН
router.get(
  "/tax/:taxNumber",
  authMiddleware("user"),
  companyController.getCompanyByTaxNumber,
);

// Обновление компании
router.put("/:id", authMiddleware("user"), companyController.updateCompany);

// Удаление компании
router.delete("/:id", authMiddleware("user"), companyController.deleteCompany);

// Поиск компаний
router.get(
  "/search",
  authMiddleware("user"),
  companyController.searchCompanies,
);

// Получение дефолтной компании
router.get(
  "/default",
  authMiddleware("user"),
  companyController.getDefaultCompany,
);

// ========== ADMIN ROUTES ==========

// Синхронизация кеша компаний (админ)
router.post(
  "/sync-cache",
  authMiddleware("admin"),
  companyController.syncCache,
);

module.exports = router;
