// routes/delivery.routes.js
const express = require('express');
const router = express.Router();
const pickupPointController = require('../controllers/pickupPointController');
const transportCompanyController = require('../controllers/transportCompanyController');
const authMiddleware = require('../middlewares/auth-middleware');

// Публичные роуты
router.get('/pickup-points', pickupPointController.getPickupPoints);
router.get('/pickup-points/main', pickupPointController.getMainPickupPoint);
router.get('/pickup-points/:id', pickupPointController.getPickupPoint);

// Админские роуты
router.post('/pickup-points',
  authMiddleware('admin'),
  pickupPointController.createPickupPoint
);

router.put('/pickup-points/:id',
  authMiddleware('admin'),
  pickupPointController.updatePickupPoint
);

router.delete('/pickup-points/:id',
  authMiddleware('admin'),
  pickupPointController.deletePickupPoint
);

router.patch('/pickup-points/:id/toggle-status',
  authMiddleware('admin'),
  pickupPointController.togglePickupPointStatus
);

router.patch('/pickup-points/:id/set-main',
  authMiddleware('admin'),
  pickupPointController.setAsMainPickupPoint
);

router.put('/pickup-points/order',
  authMiddleware('admin'),
  pickupPointController.updatePickupPointsOrder
);

// ========== TRANSPORT COMPANIES ROUTES ==========

// Для пользователя
router.get('/transport-companies/active', transportCompanyController.getActive);

// Для админа
router.get('/transport-companies/', authMiddleware('admin'), transportCompanyController.getAll);
router.post('/transport-companies/', authMiddleware('admin'), transportCompanyController.create);
router.put('/transport-companies/:id', authMiddleware('admin'), transportCompanyController.update);
router.delete('/transport-companies/:id', authMiddleware('admin'), transportCompanyController.delete);



module.exports = router;