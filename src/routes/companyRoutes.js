// routes/companies.routes.js
const express = require('express');
const router = express.Router();
const companiesController = require('../controllers/companyController');
const authMiddleware = require('../middlewares/auth-middleware');

// ========== USER ROUTES ==========

// Создание компании
router.post(
  '/',
  authMiddleware('user'),
  companiesController.createCompany
);

// Получение всех компаний пользователя
router.get(
  '/',
  authMiddleware('user'),
  companiesController.getCompanies
);

// Получение компании по ID
router.get(
  '/:id',
  authMiddleware('user'),
  companiesController.getCompanyById
);

// Получение компании по ИНН
router.get(
  '/tax/:taxNumber',
  authMiddleware('user'),
  companiesController.getCompanyByTaxNumber
);

// Обновление компании
router.put(
  '/:id',
  authMiddleware('user'),
  companiesController.updateCompany
);

// Удаление компании
router.delete(
  '/:id',
  authMiddleware('user'),
  companiesController.deleteCompany
);

// Поиск компаний
router.get(
  '/search',
  authMiddleware('user'),
  companiesController.searchCompanies
);

// Получение дефолтной компании
router.get(
  '/default',
  authMiddleware('user'),
  companiesController.getDefaultCompany
);

// ========== ADMIN ROUTES ==========

// Синхронизация кеша компаний (админ)
router.post(
  '/sync-cache',
  authMiddleware('admin'),
  companiesController.syncCache
);

module.exports = router;