const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviewsController');

router.post('/leaveReview', reviewsController.leaveReview);

module.exports = router;