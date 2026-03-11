// routes/companies.routes.js
import { Router } from "express";

const router = Router();

import {
  createCompany,
  deleteCompany,
  getCompanies,
  getCompanyById,
  getCompanyByTaxNumber,
  getDefaultCompany,
  searchCompanies,
  syncCache,
  updateCompany,
} from "../controllers/companyController";
import authMiddleware from "../middlewares/auth-middleware";

// ========== USER ROUTES ==========

// Создание компании
router.post("/", authMiddleware("user"), createCompany);

// Получение всех компаний пользователя
router.get("/", authMiddleware("user"), getCompanies);

// Получение компании по ID
router.get("/:id", authMiddleware("user"), getCompanyById);

// Получение компании по ИНН
router.get("/tax/:taxNumber", authMiddleware("user"), getCompanyByTaxNumber);

// Обновление компании
router.put("/:id", authMiddleware("user"), updateCompany);

// Удаление компании
router.delete("/:id", authMiddleware("user"), deleteCompany);

// Поиск компаний
router.get("/search", authMiddleware("user"), searchCompanies);

// Получение дефолтной компании
router.get("/default", authMiddleware("user"), getDefaultCompany);

// ========== ADMIN ROUTES ==========

// Синхронизация кеша компаний (админ)
router.post("/sync-cache", authMiddleware("admin"), syncCache);

export default router;
