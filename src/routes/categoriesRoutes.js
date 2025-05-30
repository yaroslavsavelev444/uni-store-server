const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categoriesController');

router.get('/getCategories', categoriesController.getCategories);

module.exports = router;