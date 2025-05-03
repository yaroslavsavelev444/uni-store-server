const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');

router.get('/getProducts', productsController.getProducts);


module.exports = router;