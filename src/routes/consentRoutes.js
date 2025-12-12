const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');

router.get('/getConsents', consentController.list);
router.get('/getBySlug/:slug', consentController.getBySlug);

module.exports = router;